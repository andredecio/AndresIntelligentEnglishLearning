// firebase-services.js (FINAL, FINAL version for use with standard <script src="..."> tags)

// This script expects the global 'firebase' object to be available,
// created by the Firebase compat SDKs loaded in your HTML (e.g., firebase-app-compat.js, init.js).
// IMPORTANT: DO NOT use 'import' or 'export' statements anywhere in this file.

// Get references to Firebase services from the global 'firebase' object.
// These will correctly be the compat versions, supporting old syntax like .collection().
// Set region to asia-southeast1 for correct region alighnment with backend functions
const auth = firebase.auth();
const db = firebase.firestore();
// 1. Get the Firebase App instance.
// This is crucial because the .functions() method with a region is called OFF the app instance.
const app = firebase.app(); 

// 2. Get the Functions instance, specifying the region on the 'app' object.
// This is the correct v8 way to define the functions object with a region.
const functions = app.functions('asia-southeast1'); // Then you can get the storage service like this:
// const storage = firebase.storage();

// IMPORTANT: Replace "YOUR_GOOGLE_CLIENT_ID_FOR_OAUTH" with your actual Google OAuth Client ID
// This is used by ModuleContent_Classroom.js for Google Classroom integration.
//const GOOGLE_CLIENT_ID = "190391960875-g53jhbjrkbp0u42bg7bb9trufjjbmk1d.apps.googleusercontent.com"; // Added: Google Client ID


// --- Firebase Authentication Helper Functions ---

function observeAuthState(callback) {
  return auth.onAuthStateChanged(callback);
}

async function signInUserWithEmailAndPassword(email, password) {
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    console.log("Successfully signed in user:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    console.error("Error signing in:", error.message);
    throw error;
  }
}

async function signOutCurrentUser() {
  try {
    await auth.signOut();
    console.log("User signed out successfully.");
  } catch (error) {
    console.error("Error signing out:", error.message);
    throw error;
  }
}

// --- Cloud Firestore Helper Functions ---
async function getDocument(collectionName, docId) {
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
}

async function getCollectionDocs(collectionName) {
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
}

async function getLearningContentByCriteria(moduleType, imageStatus) {
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
}

// --- Make functions and services accessible globally ---
// Assign these functions and service objects to the window object.
window.auth = auth;
window.db = db;
window.functions = functions; // Added: Expose the functions service
// window.storage = storage; // Uncomment if you add storage service above

window.observeAuthState = observeAuthState;
window.signInUserWithEmailAndPassword = signInUserWithEmailAndPassword;
window.signOutCurrentUser = signOutCurrentUser;
window.getDocument = getDocument;
window.getCollectionDocs = getCollectionDocs;
window.getLearningContentByCriteria = getLearningContentByCriteria;

window.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID; // Added: Expose the Google Client ID

// You do NOT need to include your firebaseConfig object here.
// The /__/firebase/init.js script (loaded in your HTML) handles that for you.
