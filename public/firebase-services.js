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
const functions = app.functions('asia-southeast1');

// IMPORTANT: Replace "YOUR_GOOGLE_CLIENT_ID_FOR_OAUTH" with your actual Google OAuth Client ID
// This is used by ModuleContent_Classroom.js for Google Classroom integration.
const GOOGLE_CLIENT_ID = "190391960875-g53jhbjrkbp0u42bg7bb9trufjjbmk1d.apps.googleusercontent.com"; // Added: Google Client ID


// --- Firebase Authentication Helper Functions ---

// Modified: observeAuthState now fetches custom claims and user profile data
function observeAuthState(callback) {
  return auth.onAuthStateChanged(async (user) => {
    if (user) {
      let augmentedUser = { // Initialize augmentedUser here for fallbacks
        ...user,
        customClaims: {},
        profile: null
      };

      try {
        // Force refresh ID token to ensure custom claims are up-to-date
        const idTokenResult = await user.getIdTokenResult(true);
        augmentedUser.customClaims = idTokenResult.claims;
        console.log("DEBUG FS: Custom claims fetched:", augmentedUser.customClaims);

        // Fetch user's profile document from Firestore
        console.log("DEBUG FS: Attempting to fetch user profile for UID:", user.uid);
        const rawUserProfile = await getDocument('users', user.uid); // Fetch raw profile

        // --- MAPPING LOGIC START ---
        if (rawUserProfile) {
            augmentedUser.profile = {
                ...rawUserProfile, // Keep all other fields from the raw profile
                // Map the Firestore field 'planid' to 'paymentPlanId' for application consistency
                paymentPlanId: rawUserProfile.planid || null, // Use 'planid' from Firestore, default to null if not found
                // Map the Firestore field 'Currency' to 'currency' for application consistency
                currency: rawUserProfile.Currency || 'USD' // Use 'Currency' from Firestore, default to 'USD'
            };
        } else {
            augmentedUser.profile = null; // No raw profile, so augmented profile is null
        }
        // --- MAPPING LOGIC END ---

        console.log("DEBUG FS: Fetched user profile (raw data from Firestore):", rawUserProfile);
        console.log("DEBUG FS: Final Augmented user object before callback:", augmentedUser);
        console.log("DEBUG FS: Profile's currentBalance:", augmentedUser.profile ? augmentedUser.profile.currentBalance : "Profile is null or has no currentBalance field.");
        console.log("DEBUG FS: Profile's paymentPlanId (mapped from planid):", augmentedUser.profile ? augmentedUser.profile.paymentPlanId : "Profile is null or has no paymentPlanId field."); // Specific log for paymentPlanId
        console.log("DEBUG FS: Profile's currency (mapped from Currency):", augmentedUser.profile ? augmentedUser.profile.currency : "Profile is null or has no currency field."); // Specific log for currency

        callback(augmentedUser);
      } catch (error) {
        console.error("DEBUG FS: Error fetching user claims or profile:", error.message);
        // If an error fetching claims/profile, log it, but still pass the (partially) augmented user object
        console.log("DEBUG FS: Augmented user data (with error fallback):", augmentedUser);
        callback(augmentedUser);
      }
    } else {
      console.log("DEBUG FS: User is signed out.");
      callback(null);
    }
  });
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
      console.log(`DEBUG FS: Document '${docId}' from '${collectionName}' found.`);
      const data = docSnap.data();
      console.log(`DEBUG FS: Document data for '${docId}':`, data);
      console.log(`DEBUG FS: Value of 'currentBalance' property in fetched data:`, data.currentBalance);
      console.log(`DEBUG FS: Value of 'planid' property in fetched data:`, data.planid); // Specific log for 'planid' from Firestore
      console.log(`DEBUG FS: Value of 'Currency' property in fetched data:`, data.Currency); // Specific log for 'Currency' from Firestore
      return data;
    } else {
      console.warn(`DEBUG FS: No such document '${docId}' in collection '${collectionName}'!`);
      return null;
    }
  } catch (error) {
    console.error(`DEBUG FS: Error getting document '${docId}' from '${collectionName}':`, error.message);
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
    console.log(`DEBUG FS: Fetched ${docs.length} documents from collection '${collectionName}'.`);
    return docs;
  } catch (error) {
    console.error(`DEBUG FS: Error getting documents from collection '${collectionName}':`, error.message);
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
    console.log(`DEBUG FS: Fetched ${content.length} learning content documents for MODULETYPE: ${moduleType}, imageStatus: ${imageStatus}.`);
    return content;
  } catch (error) {
    console.error("DEBUG FS: Error querying learning content:", error.message);
    throw error;
  }
}

// --- Make functions and services accessible globally ---
// Assign these functions and service objects to the window object.
window.auth = auth;
window.db = db;
window.functions = functions; // Added: Expose the functions service

window.observeAuthState = observeAuthState;
window.signInUserWithEmailAndPassword = signInUserWithEmailAndPassword;
window.signOutCurrentUser = signOutCurrentUser;
window.getDocument = getDocument;
window.getCollectionDocs = getCollectionDocs;
window.getLearningContentByCriteria = getLearningContentByCriteria;

window.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID; // Added: Expose the Google Client ID

// You do NOT need to include your firebaseConfig object here.
// The /__/firebase/init.js script (loaded in your HTML) handles that for you.
