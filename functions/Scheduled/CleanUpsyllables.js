import * as functions from 'firebase-functions/v1';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { regionalFunctions } from '../config.js';

// Safe single static file deletion
async function deleteStorageFile(bucket, path) {
    try {
        const file = bucket.file(path);
        const [exists] = await file.exists();
        if (exists) {
            await file.delete();
            functions.logger.info(`  [SUCCESS] Deleted: ${path}`);
        }
    } catch (err) {
        functions.logger.error(`  [ERROR] Failed to delete ${path}:`, err.message);
    }
}

// Prefix scan deletion to catch dynamic timestamps (e.g., word_[vocabId]_[timestamp].mp3) [2.2.1, 2.2.4]
async function deleteFilesByPrefix(bucket, prefix) {
    try {
        const [files] = await bucket.getFiles({ prefix });
        for (const file of files) {
            await file.delete();
            functions.logger.info(`  [SUCCESS] Deleted dynamic file: ${file.name}`);
        }
    } catch (err) {
        functions.logger.error(`  [ERROR] Prefix search failed for ${prefix}:`, err.message);
    }
}

// Validates syllable against invalid characters and multi-beat structures
function isValidSyllable(ipa, docData = {}) {
    if (!ipa || typeof ipa !== 'string') return false;

    const isInvalidStr = (str) => {
        if (!str || typeof str !== 'string') return false;
        if (/[\/\._ \-ˈˌ]/.test(str)) return true; // Slashes, spaces, underscores, dots, hyphens
        const vowelGroups = str.match(/[iɪeæɑɒɔʊuʌɜəao]+/gi);
        return (vowelGroups ? vowelGroups.length : 0) !== 1; // Strict single beat check [2.2.4]
    };

    if (isInvalidStr(ipa)) return false;
    const candidates = [docData.ipa, docData.text, docData.spelling];
    return !candidates.some(val => val && isInvalidStr(val));
}

export const CleanUpsyllables = regionalFunctions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .pubsub.schedule('0 0 1 1 *')
  .onRun(async (context) => {
      functions.logger.info(`[CleanUpsyllables] Scheduled database cleanup started.`);
      const db = getFirestore();
      const bucket = getStorage().bucket("enduring-victor-460703-a2.firebasestorage.app");
      let syllablesDeleted = 0;
      let vocabDeleted = 0;

      try {
          const syllablesSnap = await db.collection('syllables').get();
          functions.logger.info(`[CleanUpsyllables] Fetched ${syllablesSnap.size} syllables.`);

          for (const doc of syllablesSnap.docs) {
              const syllableId = doc.id;
              const docData = doc.data();

              if (!isValidSyllable(syllableId, docData)) {
                  functions.logger.warn(`[CleanUpsyllables] Cleaning invalid syllable: "${syllableId}"`);

                  const vocabSnap = await db.collection('learningContent')
                      .where('MODULEID_ARRAY', 'array-contains', syllableId)
                      .get();

                  const batch = db.batch();

                  for (const vocabDoc of vocabSnap.docs) {
                      const vocabId = vocabDoc.id;

                      const parentCols = ['LESSON', 'learningContent'];
                      for (const col of parentCols) {
                          const parentsSnap = await db.collection(col)
                              .where('MODULEID_ARRAY', 'array-contains', vocabId)
                              .get();

                          for (const parentDoc of parentsSnap.docs) {
                              batch.update(parentDoc.ref, {
                                  MODULEID_ARRAY: FieldValue.arrayRemove(vocabId)
                              });
                              functions.logger.info(`  -> Unlinked vocab "${vocabId}" from parent ${col}/${parentDoc.id}`);
                          }
                      }

                      batch.delete(vocabDoc.ref);
                      vocabDeleted++;
                      functions.logger.info(`  -> Queued vocab delete: ${vocabId}`);

                      // 🚀 Wildcard prefix sweep to completely clear dynamic audio files and images [2.2.1, 2.2.4]
                      await deleteFilesByPrefix(bucket, `word_audio/word_${vocabId}_`);
                      for (const ext of ['png', 'jpg', 'webp']) {
                          await deleteStorageFile(bucket, `module_images/${vocabId}.${ext}`);
                      }
                  }

                  batch.delete(doc.ref);
                  syllablesDeleted++;

                  await batch.commit();

                  // Clean up syllable audio [2.2.1, 2.2.4]
                  await deleteStorageFile(bucket, `syllable_audio/${syllableId}.mp3`);
              }
          }

          functions.logger.info(`[CleanUpsyllables] Finished. Deleted Syllables: ${syllablesDeleted}, Deleted Vocab: ${vocabDeleted}`);
          return null;
      } catch (error) {
          functions.logger.error('[CleanUpsyllables] Critical error during execution:', error);
          return null;
      }
  });
