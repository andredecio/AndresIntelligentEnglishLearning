// firebase-services.js - The central hub for modular Firebase SDK initialization.
// This file initializes your Firebase App and exports all commonly used service instances.
// It should be loaded as a <script type="module"> in your HTML.

// --- 1. Import ALL necessary modular Firebase SDK functions ---
// IMPORTANT: Using Firebase SDK v12.3.0 from CDN.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-functions.js"; // Assuming httpsCallable will be used by other modules
// import { getStorage } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js"; // Uncomment if you use Cloud Storage for Firebase

// --- 2. Your Firebase project configuration ---
// This is the configuration for your Firebase web app.
const firebaseConfig = {
    apiKey: "AIzaSyAPEIXnhZ7_CFU6mId54c3IBCFgzqye-3g", // <--- IMPORTANT: Replace with your actual Web API Key from Firebase Project Settings -> General
    authDomain: "enduring-victor-460703-a2.firebaseapp.com",
    projectId: "enduring-victor-460703-a2",
    storageBucket: "enduring-victor-460703-a2.appspot.com",
    messagingSenderId: "190391960875",
    appId: "1:190391960875:web:0585d07fcb53f52755316e", // <--- IMPORTANT: Replace with your actual Web App ID from Firebase Project Settings -> General
    measurementId: "490452908" // Your GA Property ID
};

// --- 3. Initialize Firebase App and get service instances ---
export const app = initializeApp(firebaseConfig);

// Get and export the Firebase service instances.
// The 'app' instance is implicitly used by these if not explicitly passed,
// but it's good practice to pass 'app' for clarity and explicit multi-app support.
export const auth = getAuth(app);
export const db = getFirestore(app);
// Specify your Cloud Functions region when getting the functions instance.
export const functions = getFunctions(app, 'asia-southeast1');
// export const storage = getStorage(app); // Uncomment if you need storage

// --- 4. Constant for Google OAuth Client ID ---
// This is exposed for use with Google Classroom integration (ModuleContent_Classroom.js).
export const GOOGLE_CLIENT_ID = "190391960875-g53jhbjrkbp0u42bg7bb9trufjjbmk1d.apps.googleusercontent.com";

// --- 5. Firebase Authentication Helper Functions (now modular) ---
// Modified: observeAuthState now fetches custom claims and user profile data
export function observeAuthState(callback) {
  // Use the modular onAuthStateChanged, passing the 'auth' instance
  return onAuthStateChanged(auth, async (user) => {
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

export async function signInUserWithEmailAndPassword(email, password) {
  try {
    // Use the modular signInWithEmailAndPassword, passing the 'auth' instance
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("Successfully signed in user:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    console.error("Error signing in:", error.message);
    throw error;
  }
}

export async function signOutCurrentUser() {
  try {
    // Use the modular signOut, passing the 'auth' instance
    await signOut(auth);
    console.log("User signed out successfully.");
  } catch (error) {
    console.error("Error signing out:", error.message);
    throw error;
  }
}

// --- 6. Cloud Firestore Helper Functions (now modular) ---
export async function getDocument(collectionName, docId) {
  // Use modular collection and doc functions
  const docRef = doc(db, collectionName, docId);
  try {
    // Use modular getDoc function
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
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

export async function getCollectionDocs(collectionName) {
  // Use modular collection and getDocs functions
  const colRef = collection(db, collectionName);
  try {
    const querySnapshot = await getDocs(colRef);
    const docs = [];
    querySnapshot.forEach((d) => { // Renamed doc to d to avoid conflict with imported doc
      docs.push({ id: d.id, ...d.data() });
    });
    console.log(`DEBUG FS: Fetched ${docs.length} documents from collection '${collectionName}'.`);
    return docs;
  } catch (error) {
    console.error(`DEBUG FS: Error getting documents from collection '${collectionName}':`, error.message);
    throw error;
  }
}

export async function getLearningContentByCriteria(moduleType, imageStatus) {
  // Use modular collection, query, and where functions
  const learningContentRef = collection(db, "learningContent");
  const q = query(
      learningContentRef,
      where("MODULETYPE", "==", moduleType),
      where("imageStatus", "==", imageStatus)
  );

  try {
    const querySnapshot = await getDocs(q);
    const content = [];
    querySnapshot.forEach((d) => { // Renamed doc to d
      content.push({ id: d.id, ...d.data() });
    });
    console.log(`DEBUG FS: Fetched ${content.length} learning content documents for MODULETYPE: ${moduleType}, imageStatus: ${imageStatus}.`);
    return content;
  } catch (error) {
    console.error("DEBUG FS: Error querying learning content:", error.message);
    throw error;
  }
}
