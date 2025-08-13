// firebase-services.js

// Import the functions you need from the Firebase SDKs.
// We are now specifically importing the 'compat' version for Firestore
// to ensure db.collection() still works with your existing code.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore-compat.js"; // <--- CHANGED THIS LINE!

// IMPORTANT: With compat, you no longer *need* to import doc, collection, etc.
// directly from firebase-firestore.js for methods like db.collection() and docRef.collection()
// They become methods on the 'db' object itself, or on document references.
// If you are using 'collection(db, "name")' or 'doc(db, "name", "id")', you'd still need to import those:
// import { collection, doc, getDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
// But for now, let's assume you want the old syntax to work, so we remove these imports for clarity,
// as they're implicitly available through the 'db' object.
// If your onboarding.js or other files *also* explicitly imported these, you might need to adjust those too.

// Your web app's Firebase configuration.
// ... (your firebaseConfig object remains the same) ...

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Get the Authentication service instance
const db = getFirestore(app); // Get the Cloud Firestore service instance

// --- Exported Firebase Service Instances ---
export { auth, db }; // Still export 'db'

// --- Common Firebase Authentication Helper Functions ---
// ... (these remain unchanged) ...

// --- Common Cloud Firestore Helper Functions ---
// IMPORTANT: These helper functions will also need to revert to the old syntax
// if you want them to be consistent with db.collection()
// Let's modify these to use the older syntax now as well.

/**
 * Gets a single document from a collection.
 * @param {string} collectionName - The name of the collection (e.g., 'users', 'learningContent').
 * @param {string} docId - The ID of the document to retrieve.
 * @returns {Promise<object | null>} - The document data or null if not found.
 */
export const getDocument = async (collectionName, docId) => {
  // OLD SYNTAX using compat:
  const docRef = db.collection(collectionName).doc(docId); // <--- OLD SYNTAX
  try {
    const docSnap = await docRef.get(); // <--- OLD SYNTAX for get()
    if (docSnap.exists) { // <--- OLD SYNTAX property 'exists'
      console.log(`Document '${docId}' from '${collectionName}' data:`, docSnap.data());
      return docSnap.data();
    } else {
      console.log(`No such document '${docId}' in collection '${collectionName}'!`);
      return null;
    }
  } catch (error) {
    console.error(`Error getting document '${docId}' from '${collectionName}':`, error.message);
    throw error;
  }
};

/**
 * Gets all documents from a specified collection.
 * @param {string} collectionName - The name of the collection.
 * @returns {Promise<Array<object>>} - An array of document data.
 */
export const getCollectionDocs = async (collectionName) => {
  // OLD SYNTAX using compat:
  const collectionRef = db.collection(collectionName); // <--- OLD SYNTAX
  try {
    const querySnapshot = await collectionRef.get(); // <--- OLD SYNTAX for get()
    const docs = [];
    querySnapshot.forEach((doc) => {
      docs.push({ id: doc.id, ...doc.data() });
    });
    console.log(`Fetched ${docs.length} documents from collection '${collectionName}'.`);
    return docs;
  } catch (error) {
    console.error(`Error getting documents from collection '${collectionName}':`, error.message);
    throw error;
  }
};

// Example of a more specific query based on your Firestore index:
/**
 * Queries learning content by module type and image status.
 * @param {string} moduleType - The module type to filter by.
 * @param {string} imageStatus - The image status to filter by.
 * @returns {Promise<Array<object>>} - An array of matching document data.
 */
export const getLearningContentByCriteria = async (moduleType, imageStatus) => {
  // OLD SYNTAX using compat:
  const learningContentRef = db.collection("learningContent"); // <--- OLD SYNTAX
  const q = learningContentRef
    .where("MODULETYPE", "==", moduleType) // <--- OLD SYNTAX
    .where("imageStatus", "==", imageStatus); // <--- OLD SYNTAX

  try {
    const querySnapshot = await q.get(); // <--- OLD SYNTAX for get()
    const content = [];
    querySnapshot.forEach((doc) => {
      content.push({ id: doc.id, ...doc.data() });
    });
    console.log(`Fetched ${content.length} learning content documents for MODULETYPE: ${moduleType}, imageStatus: ${imageStatus}.`);
    return content;
  } catch (error) {
    console.error("Error querying learning content:", error.message);
    throw error;
  }
};
