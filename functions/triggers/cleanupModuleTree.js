import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from 'firebase-admin/storage';

const db = getFirestore();

// Helper to find and delete a child document from its correct collection
async function deleteChildDocument(childId, parentCollection) {
  const COLLECTIONS_TO_SEARCH = {
    "COURSE": ["LESSON"], // 👈 Aligns with: Courses only ever have lessons as children [1]
    "LESSON": ["learningContent"],
    "SEMANTIC_GROUP": ["learningContent", "LESSON"],
  };

  const searchCols = COLLECTIONS_TO_SEARCH[parentCollection] || ["learningContent", "LESSON"];
  for (const col of searchCols) {
    const docRef = db.collection(col).doc(childId);
    const snap = await docRef.get();
    if (snap.exists) {
      console.log(`[RECURSIVE] Deleting orphan child: ${col}/${childId}`);
      await docRef.delete();
      return;
    }
  }
}

// Helper to check if a moduleId is shared
async function isModuleShared(moduleId, currentDeletedId) {
  const collections = ["COURSE", "LESSON", "SEMANTIC_GROUP"];
  const checks = collections.map(async (col) => {
    const snap = await db.collection(col)
      .where("MODULEID_ARRAY", "array-contains", moduleId)
      .get();
    const otherRefs = snap.docs.filter(doc => doc.id !== currentDeletedId);
    return otherRefs.length > 0;
  });
  const results = await Promise.all(checks);
  return results.some(Boolean);
}

// Helper to delete files from Cloud Storage
async function deleteStorageFile(url, fileType) {
  if (!url) return;
  try {
    const decodedUrl = decodeURIComponent(url);
    let bucketName = "enduring-victor-460703-a2.firebasestorage.app";
    let filePath = "";

    if (decodedUrl.includes("firebasestorage.googleapis.com")) {
      const parts = decodedUrl.split("/o/");
      if (parts.length > 1) filePath = parts[1].split("?")[0];
      const bPart = decodedUrl.split("/b/");
      if (bPart.length > 1) bucketName = bPart[1].split("/o/")[0];
    } else if (decodedUrl.includes("storage.googleapis.com")) {
      const cleanUrl = decodedUrl.replace("https://storage.googleapis.com/", "");
      const firstSlash = cleanUrl.indexOf("/");
      if (firstSlash !== -1) {
        bucketName = cleanUrl.substring(0, firstSlash);
        filePath = cleanUrl.substring(firstSlash + 1);
      }
    }

    if (filePath) {
      console.log(`[STORAGE START] Removing ${fileType} at: gs://${bucketName}/${filePath}`);
      const file = getStorage().bucket(bucketName).file(filePath); 
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        console.log(`[STORAGE SUCCESS] Removed ${fileType} file: gs://${bucketName}/${filePath}`);
      }
    }
  } catch (error) {
    console.error(`[STORAGE ERROR] Failed to delete ${fileType}: ${url}`, error);
  }
}

// The Recursive Background Trigger
export const cleanupModuleTree = onDocumentDeleted({
  document: "{collection}/{moduleId}",
  memory: "512MiB" // 🚀 Configured with 512 MiB to safely process parallel transactions [1.2.3]
}, async (event) => {
  const { collection, moduleId } = event.params;
  const deletedData = event.data?.data();

  console.log(`[TRIGGERED] Document deleted: ${collection}/{moduleId}`);

  if (!deletedData) {
    console.warn(`[WARN] No document payload found: ${collection}/{moduleId}`);
    return;
  }

  // A. Clean up this module's media assets FIRST (Wipes Storage files!) [2.2.4]
  if (deletedData.IMAGEURL) await deleteStorageFile(deletedData.IMAGEURL, "IMAGE");
  if (deletedData.imageUrl) await deleteStorageFile(deletedData.imageUrl, "IMAGE");
  if (deletedData.audioUrl) await deleteStorageFile(deletedData.audioUrl, "AUDIO");

  // B. 🚀 Bottom-Up Parent Unlinking: (Optimized: "COURSE" is completely omitted!) [2]
  const parentRemovableTypes = ["LISTENINGSPEAKING", "READINGWRITING", "CONVERSATION", "GRAMMAR", "SEMANTIC_GROUP"];
  if (parentRemovableTypes.includes(deletedData?.MODULETYPE)) {
      const parentCols = ["LESSON", "learningContent"]; // 👈 "COURSE" removed for performance [2]
      const unlinkPromises = parentCols.map(async (col) => {
          const parentsSnap = await db.collection(col)
              .where("MODULEID_ARRAY", "array-contains", moduleId)
              .get();
          
          for (const parentDoc of parentsSnap.docs) {
              await parentDoc.ref.update({
                  MODULEID_ARRAY: FieldValue.arrayRemove(moduleId)
              });
              console.log(`[UNLINK] Automatically removed ${moduleId} from parent ${col}/${parentDoc.id}`);
          }
      });
      await Promise.all(unlinkPromises);
  }

  // EXEMPTION: Skip recursive child deletions for syllables/vocab [1]
  const exemptCollections = ["VOCABULARY", "syllables", "phonemes", "VOCABULARY_GROUP"];
  if (exemptCollections.includes(collection) || exemptCollections.includes(deletedData?.MODULETYPE)) {
    console.log(`[EXEMPT] ${collection}/{moduleId} is exempt from recursive child cleanup.`);
    return;
  }

  // C. Process children recursively (Top-Down) [1]
  if (deletedData.MODULEID_ARRAY && deletedData.MODULEID_ARRAY.length > 0) {
    console.log(`[CHILDREN] Checking ${deletedData.MODULEID_ARRAY.length} child modules for: ${collection}/{moduleId}`);
    for (const childId of deletedData.MODULEID_ARRAY) {
      const isShared = await isModuleShared(childId, moduleId);
      if (!isShared) {
        await deleteChildDocument(childId, collection);
      }
    }
  }
});
