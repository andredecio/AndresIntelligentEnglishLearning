// your-cloud-function-root/generateCourseForClassroom.js

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

// Ensure admin SDK is initialized (it will be initialized in index.js,
// but it's good practice to ensure it's available in all function files if used directly)
// If admin.initializeApp() is called multiple times, it won't re-initialize,
// but retrieve the existing app, so this is safe.
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore(); // Get a reference to your Firestore database

// --- Google OAuth Client Configuration (from Cloud Functions environment config) ---
// These values are set via `firebase functions:config:set`
const GOOGLE_CLIENT_ID = functions.config().google.client_id;
const GOOGLE_CLIENT_SECRET = functions.config().google.client_secret;
const GOOGLE_REDIRECT_URI = functions.config().google.redirect_uri;

// Helper function to get an OAuth2Client instance
function getOAuth2Client() {
    return new OAuth2Client(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );
}

// 09/08 - NEW CODE STARTS HERE

// --- Configuration for traversing your Firestore data model ---
// Defines which Firestore collections to search for children given a parent's MODULETYPE.
const COLLECTIONS_TO_SEARCH_FOR_CHILDREN = {
    'COURSE': ['LESSON'],
    'LESSON': ['learningContent', 'syllables', 'phonemes'],
    'SEMANTIC_GROUP': ['learningContent', 'LESSON', 'syllables', 'phonemes'],
    'VOCABULARY_GROUP': ['learningContent'], // children are VOCABULARY, which live in 'learningContent'
    'VOCABULARY': ['syllables'],
    'syllables': ['phonemes'],
    // Note: phonemes don't have children in this model, so no entry needed for them.
    // Ensure all possible parent MODULETYPEs that can have MODULEID_ARRAY are listed here.
};

/**
 * Helper function to retrieve a Firestore document for a given moduleId,
 * searching in collections appropriate for the parentModuleType.
 * Assumes every document has a 'MODULETYPE' field.
 * @param {string} moduleId - The ID of the document to fetch.
 * @param {string} parentModuleType - The MODULETYPE of the document's parent.
 * @returns {Promise<{data: object, id: string, collectionName: string, moduleType: string}|null>} The document data and metadata, or null if not found/invalid.
 */
async function getModuleDocument(moduleId, parentModuleType) {
    const collectionsToSearch = COLLECTIONS_TO_SEARCH_FOR_CHILDREN[parentModuleType] || [];
 // 09/08 - DEBUGGING START
    console.log(`[DEBUG] getModuleDocument called for moduleId: "${moduleId}" (parentType: "${parentModuleType}")`);
    console.log(`[DEBUG] Collections to search for ${parentModuleType}: ${collectionsToSearch.join(', ')}`);
    // 09/08 - DEBUGGING END
    for (const collectionName of collectionsToSearch) {
        try {
            const docRef = db.collection(collectionName).doc(moduleId);
             // 09/08 - DEBUGGING START
            console.log(`[DEBUG] Attempting to fetch document: ${collectionName}/${moduleId}`);
            // 09/08 - DEBUGGING END
			const docSnap = await docRef.get();
            if (docSnap.exists) {
                // 09/08 - DEBUGGING START
                console.log(`[DEBUG] Document ${collectionName}/${moduleId} FOUND. Data sample:`, JSON.stringify(docSnap.data()).substring(0, 100) + '...');
                // 09/08 - DEBUGGING END
				const data = docSnap.data();
                const moduleType = data.MODULETYPE; // Rely on the explicit MODULETYPE field in the document
                if (!moduleType) {
                    console.warn(`Document ${collectionName}/${moduleId} exists but is missing MODULETYPE field. Skipping.`);
                    continue; // Skip if crucial field is missing
                }
                console.log(`Found ${collectionName}/${moduleId} with MODULETYPE: ${moduleType}`);
                // Return data, its Firestore ID, the collection it was found in, and its determined MODULETYPE
                return { data: data, id: docSnap.id, collectionName: collectionName, moduleType: moduleType };
             } else {
                // 09/08 - DEBUGGING START
                console.log(`[DEBUG] Document ${collectionName}/${moduleId} NOT FOUND.`);
                // 09/08 - DEBUGGING END
			}
        } catch (error) {
            console.warn(`Error fetching ${collectionName}/${moduleId}:`, error);
        }
    }
    console.warn(`Module ID ${moduleId} not found in expected collections for parent type ${parentModuleType}. Skipping.`);
    return null; // Document not found in any expected collection
}

/**
 * Helper function to map Firestore document data to a Google Classroom CourseWorkMaterial request body.
 * @param {object} data - The Firestore document data.
 * @param {string} moduleType - The MODULETYPE of the current document.
 * @param {string|null} topicId - The Google Classroom Topic ID to associate this material with.
 * @returns {object} The request body for Classroom API.
 */
function mapFirestoreToClassroomBody(data, moduleType, topicId) {
    //let title = data.TITLE || `Untitled ${moduleType} Module`;
	let title = moduleType + " " + data.TITLE || `Untitled ${moduleType} Module`;

    let description = data.DESCRIPTION || '';
    const materials = []; // For attachments (links to external resources)

    // Common fields that might appear in various module types and append to description
    if (data.THEME) description += `\n\nTheme: ${data.THEME}`;
    if (data.CEFR) description += `\nCEFR Level: ${data.CEFR}`;
    if (data.MEANING_ORIGIN) description += `\nMeaning Origin: ${data.MEANING_ORIGIN}`;

    // Type-specific fields for the description based on your requirements
    switch (moduleType) {
        case 'COURSE':
        case 'LESSON':
        case 'SEMANTIC_GROUP':
        case 'VOCABULARY_GROUP':
            // These types' relevant fields (TITLE, DESCRIPTION, CEFR, THEME) are already handled
            // by the common fields or default assignment.
            break;
        case 'VOCABULARY':
            if (data.IPA) description += `\nIPA: /${data.IPA}/`;
            if (data.WORD_TYPE) description += `\nWord Type: ${data.WORD_TYPE}`;
            if (data.WORD_TYPE === 'verb') {
                if (data.SIMPLE_PAST) description += `\nSimple Past: ${data.SIMPLE_PAST}`;
                if (data.PAST_PARTICIPLE) description += `\nPast Participle: ${data.PAST_PARTICIPLE}`;
                if (data.PRESENT_SIMPLE_3RD_PERSON_SINGULAR) description += `\nPresent Simple 3rd Person Singular: ${data.PRESENT_SIMPLE_3RD_PERSON_SINGULAR}`;
            }
            break;
        case 'GRAMMAR':
        case 'LISTENINGSPEAKING':
        case 'READING-WRITING':
        case 'CONVERSATION':
        case 'syllables':
        case 'phonemes':
            // These types' relevant fields (DESCRIPTION, THEME, TITLE) are handled by common fields or default.
            // Specific attachments are handled below.
            break;
        default:
            console.warn(`mapFirestoreToClassroomBody: Unrecognized MODULETYPE: ${moduleType}.`);
    }

    // Attachments (IMAGEURL and audioURL based on moduleType)
    if (data.IMAGEURL && (['VOCABULARY', 'GRAMMAR', 'READING-WRITING', 'LISTENINGSPEAKING', 'CONVERSATION' ].includes(moduleType))) {
        materials.push({
            link: {
                url: data.IMAGEURL,
                title: `${title} Image` // Provide a meaningful title for the link
            }
        });
    }

    if (data.audioURL && (['VOCABULARY', 'LISTENINGSPEAKING', 'syllables', 'phonemes'].includes(moduleType))) {
        materials.push({
            link: {
                url: data.audioURL,
                title: `${title} Audio` // Provide a meaningful title for the link
            }
        });
    }

    // Return the request body for Classroom CourseWorkMaterial (or CourseWork if you expand logic)
    return {
        title: title,
        description: description.trim(), // Remove leading/trailing whitespace from description
        topicId: topicId, // Links it to the appropriate Classroom Topic
        materials: materials.length > 0 ? materials : undefined, // Only include if materials exist
    };
}

/**
 * Recursive function to traverse the Firestore module hierarchy and create corresponding
 * Google Classroom Topics and CourseWorkMaterials.
 * @param {string[]} moduleIds - Array of MODULEIDs for the current children to process.
 * @param {string} parentModuleType - The MODULETYPE of the direct parent (e.g., 'COURSE', 'LESSON').
 * @param {string} classroomCourseId - The ID of the Google Classroom course.
 * @param {string|null} currentClassroomTopicId - The Google Classroom Topic ID of the direct parent, if it's a Topic.
 * @param {object} classroomApiInstance - The authenticated Google Classroom API client (e.g., google.classroom({ version: 'v1', auth: oAuth2Client }))
 */
async function processChildren(
    moduleIds,
    parentModuleType,
    classroomCourseId,
    currentClassroomTopicId,
    classroomApiInstance
) {
    if (!moduleIds || moduleIds.length === 0) {
        return; // Base case: no children to process
    }

    for (const moduleId of moduleIds) {
        const moduleDoc = await getModuleDocument(moduleId, parentModuleType);

        if (!moduleDoc) {
            continue; // Skip if document could not be found or was invalid
        }

        const data = moduleDoc.data;
        const currentModuleType = moduleDoc.moduleType; // The actual MODULETYPE from the document
        let effectiveClassroomTopicId = currentClassroomTopicId; // Start with parent's topic ID

        console.log(`Processing module ${currentModuleType}/${moduleId} (Parent Topic: ${currentClassroomTopicId || 'None'})`);

        // --- Logic for Creating Google Classroom Topics ---
        // LESSONs and SEMANTIC_GROUPs become Classroom Topics as per your design
        if (currentModuleType === 'LESSON' || currentModuleType === 'SEMANTIC_GROUP') {
            try {
                const topicName = data.TITLE || `Untitled ${currentModuleType}`;
                const topicResponse = await classroomApiInstance.courses.topics.create({
                    courseId: classroomCourseId,
                    requestBody: { name: topicName },
                });
                effectiveClassroomTopicId = topicResponse.data.topicId;
                console.log(`--> Created Classroom Topic: "${topicName}" (ID: ${effectiveClassroomTopicId})`);
            } catch (error) {
                console.error(`Failed to create Classroom topic for ${currentModuleType}/${moduleId}. Error:`, error.errors ? JSON.stringify(error.errors) : error.message);
                // If topic creation fails, we cannot assign children to it, so skip processing its children.
                if (data.MODULEID_ARRAY && data.MODULEID_ARRAY.length > 0) {
                   console.warn(`Skipping children of ${currentModuleType}/${moduleId} due to topic creation failure.`);
                }
                continue;
            }
        }

        // --- Logic for Creating Google Classroom CourseWorkMaterials ---
        // All other module types typically become CourseWorkMaterials.
        const requestBody = mapFirestoreToClassroomBody(data, currentModuleType, effectiveClassroomTopicId);

        if (requestBody) { // Only create material if a valid request body can be formed
            try {
                await classroomApiInstance.courses.courseWorkMaterials.create({
                    courseId: classroomCourseId,
                    requestBody: requestBody,
                });
                console.log(`--> Created Classroom CourseWorkMaterial: "${requestBody.title}" for ${currentModuleType}/${moduleId}`);
            } catch (error) {
                console.error(`Failed to create Classroom material for ${currentModuleType}/${moduleId}. Error:`, error.errors ? JSON.stringify(error.errors) : error.message);
                // Continue to process next sibling even if this one fails
            }
        }

        // --- Recursively process children of the current module ---
        if (data.MODULEID_ARRAY && data.MODULEID_ARRAY.length > 0) {
            await processChildren(
                data.MODULEID_ARRAY,
                currentModuleType, // The type of the current module becomes the parent type for its children's lookup
                classroomCourseId,
                effectiveClassroomTopicId, // Pass the newly created topic ID (or parent's topic ID)
                classroomApiInstance
            );
        }
    }
}

// 09/08 - NEW CODE ENDS HERE

// --- The actual Cloud Function ---
// Export this function so it can be imported and exposed by index.js
exports.generateCourseForClassroom = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    // 1. Firebase Authentication (ensures a signed-in user triggered this)
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }
    const firebaseAuthUid = context.auth.uid; // The UID of the Firebase user who called the function

    // 2. Input Validation
    const courseId = data.courseId;
    const authorizationCode = data.authorizationCode;

    if (!courseId || typeof courseId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a valid "courseId" argument.');
    }

    try {
        // Fetch the COURSE data from Firestore
        const courseRef = db.collection('COURSE').doc(courseId);
        const courseDoc = await courseRef.get();

        if (!courseDoc.exists) {
            throw new functions.https.HttpsError('not-found', `Course with ID ${courseId} not found in Firestore.`);
        }
        const courseData = courseDoc.data();

        // 09/08 - NEW CODE
        // Idempotency Check: Prevent re-exporting if already done
        // Check for 'classroomExported' flag, which signifies the entire process (including content) completed.
        if (courseData.classroomExported === true) {
            console.log(`Course ${courseId} already marked as exported to Classroom. Returning success.`);
            return { success: true, message: `Course '${courseData.TITLE || courseData.name || courseId}' content already exported to Google Classroom.`, classroomCourseId: courseData.classroomCourseId };
        }
        // 09/08 - NEW CODE

        // --- OAuth Token Management ---
        const userTokensRef = db.collection('userClassroomTokens').doc(firebaseAuthUid);
        let userTokens = (await userTokensRef.get()).data();
        const oAuth2Client = getOAuth2Client();

        if (authorizationCode && (!userTokens || !userTokens.refreshToken)) {
            // SCENARIO 1: First time authorization OR refresh token is missing, exchange the code
            console.log(`[${firebaseAuthUid}] Exchanging authorization code for tokens...`);
            const { tokens } = await oAuth2Client.getToken(authorizationCode);
            // Verify refresh token is provided
            if (!tokens.refresh_token) {
                console.error(`[${firebaseAuthUid}] OAuth flow completed without a refresh token. Ensure 'access_type: offline' and 'prompt: consent' are used during authorization.`);
                throw new functions.https.HttpsError(
                    'failed-precondition',
                    'Failed to obtain a refresh token. Please re-authorize, ensuring offline access is granted.'
                );
            }
            userTokens = {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiryDate: tokens.expiry_date,
                scope: tokens.scope
            };
             await userTokensRef.set(userTokens); // Use set without merge to ensure fresh state
            console.log(`[${firebaseAuthUid}] Tokens acquired and refresh token stored.`);
			// Set the new tokens on the client *after* successful exchange
            oAuth2Client.setCredentials({
                access_token: userTokens.accessToken,
                refresh_token: userTokens.refreshToken, // Set both new tokens
                expiry_date: userTokens.expiryDate
            });



        } else if (userTokens && userTokens.refreshToken) {
            // SCENARIO 2: Refresh token already exists, try to use it
            console.log(`[${firebaseAuthUid}] Refresh token found. Attempting to set credentials.`);
            oAuth2Client.setCredentials({
                refresh_token: userTokens.refreshToken,
                access_token: userTokens.accessToken // Use the stored access token, if any
            });

            // The refreshAccessToken method will update the credentials on the client itself.
            if (oAuth2Client.isTokenExpiring() || !userTokens.accessToken) {
                console.log(`[${firebaseAuthUid}] Access token expired or not set, refreshing...`);
                try {
                    const { credentials } = await oAuth2Client.refreshAccessToken();
                    userTokens.accessToken = credentials.access_token;
                    userTokens.expiryDate = credentials.expiry_date;
                    await userTokensRef.update({
                        accessToken: credentials.access_token,
                        expiryDate: credentials.expiry_date
                    });
                    console.log(`[${firebaseAuthUid}] Access token refreshed and stored.`);
                } catch (refreshError) {
                    console.error(`[${firebaseAuthUid}] Error refreshing access token:`, refreshError.message);
                    // This is crucial: if refresh fails, the refresh token is likely invalid.
                    // Clear the stored tokens and force re-authorization.
                    await userTokensRef.delete(); // Clear invalid tokens
                    throw new functions.https.HttpsError(
                        'unauthenticated',
                        'Your Google Classroom authorization has expired or been revoked. Please re-authorize through the app.'
                    );
                }
            } else {
                console.log(`[${firebaseAuthUid}] Using existing valid access token.`);
            }
        } else {
            // No authorization code, no refresh token - user needs to authorize
            console.error(`[${firebaseAuthUid}] No authorization code or refresh token found.`);
            throw new functions.https.HttpsError(
                'failed-precondition',
                'Google Classroom authorization is required. Please re-authorize through the app.'
            );
        }

        // --- Initialize Google Classroom API Client ---
        const classroom = google.classroom({ version: 'v1', auth: oAuth2Client });

        // --- Create/Retrieve Main Google Classroom Course ---
        let classroomCourseId = courseData.classroomCourseId; // Check if an ID is already stored in Firestore

        if (!classroomCourseId) {
            // Course not yet linked to Classroom, create it
            const newCourseDetails = {
                name: courseData.TITLE || courseData.name || `Firebase Course: ${courseId}`, // Use TITLE first, then name, then ID
                section: courseData.section || 'Generated via App',
                descriptionHeading: courseData.DESCRIPTION || courseData.description || 'Content created from Firebase Learning App.',
                ownerId: 'me', // 'me' refers to the user authenticated via OAuth2Client (i.e., the user's account)
                courseState: 'PROVISIONED', // Or 'ACTIVE'
            };

            console.log(`[${firebaseAuthUid}] Attempting to create Google Classroom course for courseId: ${courseId}`);
            const createdClassroomCourse = await classroom.courses.create({ requestBody: newCourseDetails });
            classroomCourseId = createdClassroomCourse.data.id;
            console.log(`[${firebaseAuthUid}] Google Classroom course created: ${createdClassroomCourse.data.name} (ID: ${classroomCourseId})`);
        } else {
            // Course already linked, verify its existence (optional but robust)
            console.log(`[${firebaseAuthUid}] Course ${courseId} is already linked to Classroom ID: ${classroomCourseId}. Verifying existence.`);
            try {
                // Attempt to get the course to confirm it still exists in Classroom
                await classroom.courses.get({ id: classroomCourseId });
                console.log(`[${firebaseAuthUid}] Existing Classroom course ${classroomCourseId} confirmed.`);
            } catch (getCourseError) {
                // If it fails to get, it means the Classroom course either doesn't exist
                // or the user no longer has access. Re-create it.
                console.warn(`[${firebaseAuthUid}] Existing classroomCourseId ${classroomCourseId} not found in Google Classroom or inaccessible. Error: ${getCourseError.message}. Attempting to create a new one.`);
                
                const newCourseDetails = {
                    name: courseData.TITLE || courseData.name || `Firebase Course: ${courseId} (Re-created)`,
                    section: courseData.section || 'Generated via App',
                    descriptionHeading: courseData.DESCRIPTION || courseData.description || 'Content created from Firebase Learning App.',
                    ownerId: 'me',
                    courseState: 'PROVISIONED',
                };
                const createdClassroomCourse = await classroom.courses.create({ requestBody: newCourseDetails });
                classroomCourseId = createdClassroomCourse.data.id;
                console.log(`[${firebaseAuthUid}] Created NEW Google Classroom course after old one not found/inaccessible: ${createdClassroomCourse.data.name} (ID: ${classroomCourseId})`);
            }
        }

        // 09/08 - NEW CODE
        // --- Process and Export all Child Data to Google Classroom ---
        console.log(`[${firebaseAuthUid}] Starting recursive export of child modules for Classroom Course ID: ${classroomCourseId}`);
        if (courseData.MODULEID_ARRAY && courseData.MODULEID_ARRAY.length > 0) {
            await processChildren(
                courseData.MODULEID_ARRAY,
				
                'COURSE', // The type of the very top-level parent for initial lookup
                classroomCourseId,
                null, // No parent topic for these top-level children (LESSONs will be topics)
                classroom // Pass the authenticated classroom API instance
            );
            console.log(`[${firebaseAuthUid}] Finished recursive export of child modules.`);
        } else {
            console.log(`[${firebaseAuthUid}] No child modules (MODULEID_ARRAY) found for course ${courseId}.`);
        }

        // --- Update Firestore document with successful export status ---
        // This marks the course and its content as fully exported in your Firestore.
        await db.collection('COURSE').doc(courseId).update({
            classroomExported: true, // Mark as fully exported
            classroomCourseId: classroomCourseId, // Ensure the final Classroom ID is stored
            exportedAt: admin.firestore.FieldValue.serverTimestamp(), // Add a timestamp for audit
        });
        // 09/08 - NEW CODE

        // Return a success response to the frontend
        return {
            status: 'success',
            message: `Course '${courseData.TITLE || courseData.name || courseId}' and all its content successfully exported to Google Classroom!`,
            classroomCourseId: classroomCourseId // Return the final Classroom ID
        };

    } catch (error) {
        console.error(`[${firebaseAuthUid}] Error in generateCourseForClassroom:`, error);

        // Standardized error handling for callable functions
        if (error.code) {
            // If it's already an HttpsError, re-throw it directly
            throw error;
        } else if (error.response && error.response.data && error.response.data.error) {
            // Specific handling for Google API errors
            console.error(`[${firebaseAuthUid}] Google API Error Details:`, JSON.stringify(error.response.data.error));
            throw new functions.https.HttpsError(
                'internal',
                `Google Classroom API error: ${error.response.data.error.message || 'Unknown API error'}. Please check permissions.`,
                error.response.data.error
            );
        } else if (error.message && error.message.includes('redirect_uri_mismatch')) {
             throw new functions.https.HttpsError(
                'invalid-argument',
                'OAuth redirect URI mismatch. Ensure your Firebase Hosting URL is correctly configured in Google Cloud Console OAuth Client ID.',
                error.message
            );
        } else if (error.message.includes('Token has been revoked') || error.message.includes('invalid_grant')) {
             throw new functions.https.HttpsError(
                'unauthenticated',
                'Google Classroom token revoked or invalid. Please re-authorize through the app.',
                error.message
            );
        }
        else {
            // Catch-all for any other unexpected errors
            throw new functions.https.HttpsError(
                'internal',
                'Failed to integrate course with Google Classroom due to an unexpected error.',
                error.message
            );
        }
    }
});
