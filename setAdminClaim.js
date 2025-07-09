// setAdminClaim.js
const admin = require('firebase-admin');

// Replace with the path to your downloaded service account key JSON file
const serviceAccount = require('C:/Users/ACER/AI TEACHING SYSTEM/enduring-victor-460703-a2-firebase-adminsdk-fbsvc-76c07262d3.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const adminUid = 'WxGARaxfYcQCrR7YXBn6jcmf8Ix2'; // <<<<< IMPORTANT: Find your UID in Firebase Auth console
// Go to Firebase Console -> Authentication -> Users. Click on your admin email. The UID is listed there.

admin.auth().setCustomUserClaims(adminUid, { admin: true })
  .then(() => {
    console.log(`Custom claim 'admin: true' set for user ${adminUid}`);
    console.log('User will need to re-authenticate for the claim to take effect.');
    process.exit();
  })
  .catch((error) => {
    console.error('Error setting custom claim:', error);
    process.exit(1);
  });
