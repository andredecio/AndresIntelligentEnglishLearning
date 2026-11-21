import { db } from './firebase-services.js'; 

import { 
  getFirestore, 
  doc, 
  updateDoc, 
  arrayRemove, 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  getDoc,
  getDocs,
  where,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

// --- 1. Updated Unlink & Auto-Deletion Function ---
export async function unlinkChildFromParent(parentCollection, parentId, childId) {
  try {
    // A. Unlink the child from this parent's array first
    const parentDocRef = doc(db, parentCollection, parentId);
    const updatePayload = { MODULEID_ARRAY: arrayRemove(childId) };
    if (parentCollection === 'COURSE') updatePayload.classroomExported = false;
    await updateDoc(parentDocRef, updatePayload);

    // B. Safely locate the child document in either learningContent or LESSON
    let childDocRef = null;
    let childSnap = null;
    const collectionsToSearch = ["learningContent", "LESSON"];

    for (const col of collectionsToSearch) {
      const ref = doc(db, col, childId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        childDocRef = ref;
        childSnap = snap;
        break;
      }
    }

    if (childSnap) {
      const childData = childSnap.data();
      const moduleType = childData?.MODULETYPE;
      
      // C. EXEMPTION: Never auto-delete vocab, syllables, or phonemes
      const exemptTypes = ["VOCABULARY", "VOCABULARY_GROUP", "SYLLABLE", "PHONEME"];
      if (exemptTypes.includes(moduleType)) {
        console.log(`Unlinked child ${childId} (${moduleType}) is exempt from auto-deletion.`);
        return;
      }

      // D. Check if any other parent still contains this childId (Fix: Checked 'learningContent' instead of 'SEMANTIC_GROUP')
      const parentCollections = ["COURSE", "LESSON", "learningContent"];
      let referenceCount = 0;

      for (const col of parentCollections) {
        const q = query(collection(db, col), where("MODULEID_ARRAY", "array-contains", childId));
        const snap = await getDocs(q);
        referenceCount += snap.size;
      }

      // E. If no other parents reference it, delete it completely!
      if (referenceCount === 0) {
        console.log(`Child ${childId} (${moduleType}) is an orphan. Deleting document...`);
        await deleteDoc(childDocRef); 
      }
    }
  } catch (error) {
    console.error(`Failed to unlink child ${childId}:`, error);
  }
}

// --- 2. Infinite Scroll Real-Time States ---
let currentLimit = 10;
let unsubscribeScroll = null;

/**
 * Starts a real-time listener with a dynamic limit.
 */
export function startScrollingListener(renderCallback) {
  if (unsubscribeScroll) unsubscribeScroll();

  const scrollingQuery = query(
    collection(db, "learningContent"),
    orderBy("createdAt", "desc"),
    limit(currentLimit)
  );

  unsubscribeScroll = onSnapshot(scrollingQuery, (snapshot) => {
    const items = [];
    snapshot.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderCallback(items);
  }, (error) => {
    console.error("Real-time scrolling query error:", error);
  });
}

/**
 * Increments the limit and recreates the listener.
 */
export function loadNextPage(renderCallback) {
  currentLimit += 10;
  startScrollingListener(renderCallback);
}

/**
 * Initializes listeners and mounts the scroll detection window listener.
 */
export function setupInfiniteScroll(renderCallback) {
  startScrollingListener(renderCallback);

  window.addEventListener("scroll", () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
      loadNextPage(renderCallback);
    }
  });
}
