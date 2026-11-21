import * as functions from 'firebase-functions/v1';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { regionalFunctions } from '../config.js';

// Helper to find and delete any file matching a prefix (catches dynamic timestamps) [2.2.1, 2.2.4]
async function deleteFilesByPrefix(bucket, prefix) {
    try {
        const [files] = await bucket.getFiles({ prefix });
        await Promise.all(files.map(async (file) => {
            await file.delete();
            functions.logger.info(`  [SUCCESS] Deleted dynamic file: ${file.name}`);
        }));
    } catch (err) {
        functions.logger.error(`  [ERROR] Prefix search failed for ${prefix}:`, err.message);
    }
}

// Scans parents and automatically prunes any deleted/dangling child IDs [1]
async function healDanglingReferences(db, collectionName) {
    const parentSnap = await db.collection(collectionName).get();
    functions.logger.info(`[Self-Healing] Checking ${parentSnap.size} documents in ${collectionName} for dangling references.`);

    for (const parentDoc of parentSnap.docs) {
        const data = parentDoc.data();
        const childIds = data.MODULEID_ARRAY || [];
        if (childIds.length === 0) continue;

        const deadIds = [];
        for (const childId of childIds) {
            const searchTargets = ['learningContent', 'LESSON', 'COURSE', 'syllables', 'phonemes'];
            let exists = false;
            for (const col of searchTargets) {
                const childRef = db.collection(col).doc(childId);
                const childSnap = await childRef.get();
                if (childSnap.exists) {
                    exists = true;
                    break;
                }
            }
            if (!exists) deadIds.push(childId); // Found a dangling reference! [1]
        }

        if (deadIds.length > 0) {
            functions.logger.warn(`[Self-Healing] Pruning dangling IDs from ${collectionName}/${parentDoc.id}:`, deadIds);
            await parentDoc.ref.update({
                MODULEID_ARRAY: FieldValue.arrayRemove(...deadIds)
            });
            functions.logger.info(`  [SUCCESS] Cleared dangling IDs from ${parentDoc.id} [1]`);
        }
    }
}

export const CleanupIMAGEandMP3orphans = regionalFunctions
  .runWith({ timeoutSeconds: 540, memory: '2GB' }) // High performance profile
  .pubsub.schedule('0 0 1 1 *')
  .onRun(async (context) => {
      const db = getFirestore();
      const bucket = getStorage().bucket("enduring-victor-460703-a2.firebasestorage.app");

      // 1. Clear historical timestamp duplicates for active syllables! [2.2.1, 2.2.4]
      functions.logger.info(`[CleanupIMAGEandMP3orphans] Starting active syllables sweep...`);
      const syllablesSnap = await db.collection('syllables').get();
      const syllableDocs = syllablesSnap.docs;
      for (let i = 0; i < syllableDocs.length; i += 50) {
          const batchDocs = syllableDocs.slice(i, i + 50);
          await Promise.all(batchDocs.map(doc => 
              deleteFilesByPrefix(bucket, `syllable_audio/syllable_${doc.id}_`)
          ));
      }

      // 2. 🚀 NEW: Clear historical timestamp duplicates for active vocabulary modules! [2.2.1, 2.2.4]
      functions.logger.info(`[CleanupIMAGEandMP3orphans] Starting active vocabulary sweep...`);
      const vocabSnap = await db.collection('learningContent')
          .where('MODULETYPE', '==', 'VOCABULARY')
          .get();
      const vocabDocs = vocabSnap.docs;
      for (let i = 0; i < vocabDocs.length; i += 50) {
          const batchDocs = vocabDocs.slice(i, i + 50);
          await Promise.all(batchDocs.map(doc => 
              deleteFilesByPrefix(bucket, `word_audio/word_${doc.id}_`)
          ));
      }

      // 3. RUN SELF-HEALING SWEEP: Scan and scrub all dangling references! [1]
      functions.logger.info(`[CleanupIMAGEandMP3orphans] Starting database self-healing...`);
      const parentCollections = ['COURSE', 'LESSON', 'learningContent'];
      for (const col of parentCollections) {
          await healDanglingReferences(db, col);
      }

      functions.logger.info(`[CleanupIMAGEandMP3orphans] Maintenance sweep complete.`);
      return null;
  });
