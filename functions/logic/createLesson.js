const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const db = admin.firestore();
const createLesson = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    // --- Security Check (Crucial for Admin Functions) ---
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    if (!context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Only authorized administrators can perform this action.');
    }
    // --- End Security Check ---

  try {
    const { theme, cefr, expectedModuleCount } = data;

    const newLessonRef = db.collection("LESSON").doc();
    const MODULEID = newLessonRef.id;

    const lessonData = {
      MODULETYPE: "LESSON",
      MODULEID,
	  TITLE: theme ? "Lesson Theme: " + theme : "New Lesson",
      THEME: theme || "",
      CEFR_LEVEL: cefr || "",
      EXPECTED_MODULE_COUNT: expectedModuleCount || 0,
      MODULEID_ARRAY: [],
      CREATED_AT: admin.firestore.FieldValue.serverTimestamp(),
    };

    await newLessonRef.set(lessonData);

    return { success: true, MODULEID };
  } catch (error) {
    console.error("Error creating LESSON:", error);
    return { success: false, error: error.message };
  }
});

module.exports = { createLesson };