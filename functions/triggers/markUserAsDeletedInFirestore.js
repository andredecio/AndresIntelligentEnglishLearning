// --- Existing: Mark User as Deleted Function ---
// This function is triggered when a user is deleted from Firebase Authentication.
// It marks their corresponding Firestore document as deleted rather than removing it.
const admin = require('firebase-admin'); // <-- Needs these imports
const functions = require('firebase-functions/v1');





const handleUserDeletion = async (userRecord) => {
    // --- CHANGE: Updated to use admin.firestore() directly. ---
    const db = admin.firestore();
    const userId = userRecord.uid;
    const userEmail = userRecord.email;

    functions.logger.log(`Auth user deletion detected for UID: ${userId}, Email: ${userEmail || 'N/A'}.`);

    const userDocRef = db.collection("users").doc(userId);

    try {
        const docSnapshot = await userDocRef.get();

        if (docSnapshot.exists) {
            // --- CHANGE: Fixed typo (removed 'f' before await). ---
            await userDocRef.update({
                isDeleted: true,
                deletedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            functions.logger.log(`Firestore document for user ${userId} successfully marked as deleted. All data retained.`);
            return { status: "success", message: `Document for ${userId} marked as deleted, data retained.` };
        } else {
            functions.logger.log(`Firestore document for UID ${userId} not found. No marking needed as no data exists to retain.`);
            return { status: "success", message: `No document found for ${userId}.` };
        }
    } catch (error) {
        functions.logger.error(`Error marking user ${userId} as deleted in Firestore:`, error);
        throw new Error(`Failed to mark user as deleted: ${error.message}`);
    }
};

const markUserAsDeletedInFirestore = functions.region('asia-southeast1').auth.user().onDelete(handleUserDeletion);



module.exports = {
  markUserAsDeletedInFirestore,
};