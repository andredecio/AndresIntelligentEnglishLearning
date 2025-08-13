// firebase-services.js

// Import the functions you need from the Firebase SDKs.
// We're keeping `initializeApp` and `getAuth` as modular imports.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

// **IMPORTANT CHANGE FOR FIRESTORE:**
// We import the 'firebase-firestore-compat.js' module for its side effect.
// This adds the `.firestore()` method to our `app` instance, allowing us
// to use the older `db.collection()` syntax that your existing code expects.
import "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore-compat.js"; // <--- THIS IS THE KEY IMPORT!

// Your web app's Firebase configuration.
// IMPORTANT: Replace 'YOUR_API_KEY', 'YOUR_MESSAGING_SENDER_ID', and 'YOUR_APP_ID'
// with the actual values from your Firebase Project settings -> Project Overview -> Your Web App.
// You can find these in the Firebase Console: Project settings -> General -> Your apps -> Web app.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", // <--- YOU MUST REPLACE THIS!
  authDomain: "enduring-victor-460703-a2.firebaseapp.com",
  projectId: "enduring-victor-460703-a2",
  storageBucket: "enduring-victor-460703-a2.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // <--- YOU MUST REPLACE THIS!
  appId: "YOUR_APP_ID", // <--- YOU MUST REPLACE THIS!
  // measurementId: "G-XXXXXXXXXX" // If you're using Google Analytics, add this too.
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Get the Authentication service instance

// **IMPORTANT CHANGE FOR FIRESTORE INITIALIZATION:**
// Get the Cloud Firestore service instance using the compat method on the app object
const db = app.firestore(); // <--- THIS IS HOW YOU GET THE DB INSTANCE IN COMPAT MODE!

// --- Exported Firebase Service Instances ---
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

// --- Common Cloud Firestore Helper Functions (Already adapted to compat syntax) ---

/**
 * Gets a single document from a collection.
 * @param {string} collectionName - The name of the collection (e.g., 'users', 'learningContent').
 * @param {string} docId - The ID of the document to retrieve.
 * @returns {Promise<object | null>} - The document data or null if not found.
 */
export const getDocument = async (collectionName, docId) => {
  // Using OLD SYNTAX with compat:
  const docRef = db.collection(collectionName).doc(docId);
  try {
    const docSnap = await docRef.get();
    if (docSnap.exists) {
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
  // Using OLD SYNTAX with compat:
  const collectionRef = db.collection(collectionName);
  try {
    const querySnapshot = await collectionRef.get();
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
  // Using OLD SYNTAX with compat:
  const learningContentRef = db.collection("learningContent");
  const q = learningContentRef
    .where("MODULETYPE", "==", moduleType)
    .where("imageStatus", "==", imageStatus);

  try {
    const querySnapshot = await q.get();
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
