// firebase-services.js

// Import the functions you need from the Firebase SDKs.
// We're using the modular SDK (v9+) here, which is great for tree-shaking!
// For web apps without a bundling tool (like Webpack, Rollup, Parcel),
// you can directly import from the CDN URLs. Make sure these versions
// match any other Firebase SDK versions you might be using elsewhere.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  // Add other auth methods here as needed, e.g., createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  // Add other firestore methods as needed, e.g., setDoc, addDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// Your web app's Firebase configuration.
// IMPORTANT: Replace 'YOUR_API_KEY', 'YOUR_MESSAGING_SENDER_ID', and 'YOUR_APP_ID'
// with the actual values from your Firebase Project settings -> Project Overview -> Your Web App.
// You can find these in the Firebase Console: Project settings -> General -> Your apps -> Web app.
const firebaseConfig = {
  apiKey: "AIzaSyDkV052ef1mAWGnlNqJ7L8L3EE0KdnZHZw",
  authDomain: "enduring-victor-460703-a2.firebaseapp.com",
  projectId: "enduring-victor-460703-a2",
  storageBucket: "enduring-victor-460703-a2.firebasestorage.app",
  messagingSenderId: "190391960875",
  appId: "1:190391960875:web:0585d07fcb53f52755316e",
  measurementId: "G-5ECFS9Z747"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Get the Authentication service instance
const db = getFirestore(app); // Get the Cloud Firestore service instance

// --- Exported Firebase Service Instances ---
// You can export these directly if other modules need full access to Auth or Firestore.
export { auth, db };

// --- Common Firebase Authentication Helper Functions ---

/**
 * Attaches an observer to the authentication state.
 * @param {function(firebase.User | null)} callback - Function to call when auth state changes.
 */
export const observeAuthState = (callback) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Signs in a user with email and password.
 * @param {string} email - User's email.
 * @param {string} password - User's password.
 * @returns {Promise<firebase.User | null>} - The signed-in user or null if an error occurs.
 */
export const signInUserWithEmailAndPassword = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("Successfully signed in user:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    console.error("Error signing in:", error.message);
    throw error; // Re-throw to allow calling code to handle the error
  }
};

/**
 * Signs out the current user.
 * @returns {Promise<void>}
 */
export const signOutCurrentUser = async () => {
  try {
    await signOut(auth);
    console.log("User signed out successfully.");
  } catch (error) {
    console.error("Error signing out:", error.message);
    throw error;
  }
};

// --- Common Cloud Firestore Helper Functions ---

/**
 * Gets a single document from a collection.
 * @param {string} collectionName - The name of the collection (e.g., 'users', 'learningContent').
 * @param {string} docId - The ID of the document to retrieve.
 * @returns {Promise<object | null>} - The document data or null if not found.
 */
export const getDocument = async (collectionName, docId) => {
  const docRef = doc(db, collectionName, docId);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
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
  const q = query(collection(db, collectionName));
  try {
    const querySnapshot = await getDocs(q);
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
  const learningContentRef = collection(db, "learningContent");
  const q = query(
    learningContentRef,
    where("MODULETYPE", "==", moduleType),
    where("imageStatus", "==", imageStatus)
  );

  try {
    const querySnapshot = await getDocs(q);
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


// You can add more specific functions here for your COURSE, LESSON, syllables, phonemes collections
// based on what your app needs to do with them.
