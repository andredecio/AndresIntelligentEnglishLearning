// your-cloud-function-root/generateCourseForClassroom.js
// Version v1.006x for autoregenerate access tokens when revoked/expired
import * as functions from "firebase-functions/v1";
import { regionalFunctions } from "../config.js"; // <--- ADD THIS LINE
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

// Ensure admin SDK is initialized safely
if (getApps().length === 0) {
    initializeApp();
}
const db = getFirestore(); // Get a reference to your Firestore database

// --- Google OAuth Client Configuration ---
// Client ID and Redirect URI are standard environment variables (not sensitive) [1.1.5]
// Client Secret is securely loaded from Google Cloud Secret Manager at runtime [1.1.5]

// Helper function to get an OAuth2Client instance
function getOAuth2Client() {
	// 🔍 Add this line to see exactly what Node is reading at runtime!
    console.log(`[DEBUG] GOOGLE_REDIRECT_URI is: "${process.env.GOOGLE_REDIRECT_URI}"`);
    return new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,        //  Reads directly from process.env at runtime
        process.env.GOOGLE_CLIENT_SECRET,    //  Reads directly from process.env at runtime
        process.env.GOOGLE_REDIRECT_URI      //  Reads directly from process.env at runtime
    );
}

// --- Configuration for traversing your Firestore data model ---
const COLLECTIONS_TO_SEARCH_FOR_CHILDREN = {
    'COURSE': ['LESSON'],
    'LESSON': ['learningContent'], 
    'SEMANTIC_GROUP': ['learningContent', 'LESSON'], 
    'VOCABULARY_GROUP': ['learningContent'], 
    'VOCABULARY': [], 
};

/**
 * Helper function to retrieve a Firestore document for a given moduleId,
 * searching in collections appropriate for the parentModuleType.
 */
async function getModuleDocument(moduleId, parentModuleType) {
    const collectionsToSearch = COLLECTIONS_TO_SEARCH_FOR_CHILDREN[parentModuleType] || [];
    console.log(`[DEBUG] getModuleDocument called for moduleId: "${moduleId}" (parentType: "${parentModuleType}")`);
    console.log(`[DEBUG] Collections to search for ${parentModuleType}: ${collectionsToSearch.join(', ')}`);
    
    for (const collectionName of collectionsToSearch) {
        try {
            const docRef = db.collection(collectionName).doc(moduleId);
            console.log(`[DEBUG] Attempting to fetch document: ${collectionName}/${moduleId}`);
			const docSnap = await docRef.get();
            if (docSnap.exists) {
                console.log(`[DEBUG] Document ${collectionName}/${moduleId} FOUND. Data sample:`, JSON.stringify(docSnap.data()).substring(0, 100) + '...');
				const data = docSnap.data();
                const moduleType = data.MODULETYPE; 
                if (!moduleType) {
                    console.warn(`Document ${collectionName}/${moduleId} exists but is missing MODULETYPE field. Skipping.`);
                    continue; 
                }
                console.log(`Found ${collectionName}/${moduleId} with MODULETYPE: ${moduleType}`);
                return { data: data, id: docSnap.id, collectionName: collectionName, moduleType: moduleType };
             } else {
                console.log(`[DEBUG] Document ${collectionName}/${moduleId} NOT FOUND.`);
			}
        } catch (error) {
            console.warn(`Error fetching ${collectionName}/${moduleId}:`, error);
        }
    }
    console.warn(`Module ID ${moduleId} not found in expected collections for parent type ${parentModuleType}. Skipping.`);
    return null; 
}

/**
 * Helper function to map Firestore document data to a Google Classroom CourseWorkMaterial request body.
 */
function mapFirestoreToClassroomBody(data, moduleType, topicId) {
    const normalizedModuleType = moduleType ? String(moduleType).trim() : '';

    console.log(`[DEBUG_SKIP] mapFirestoreToClassroomBody received original moduleType: "${moduleType}", normalized: "${normalizedModuleType}"`);

    const MODULE_TYPES_TO_SKIP_AS_MATERIAL = ['syllables', 'phonemes', 'VOCABULARY_GROUP', 'LESSON', 'SEMANTIC_GROUP'];

    if (MODULE_TYPES_TO_SKIP_AS_MATERIAL.includes(normalizedModuleType)) {
        console.log(`Skipping material creation for module type: ${normalizedModuleType} as it is in the skip list.`);
        return null; 
    }

    let title = normalizedModuleType + " " + data.TITLE || `Untitled ${normalizedModuleType} Module`; 

    let description = data.DESCRIPTION || '';
    const materials = []; 

    if (data.THEME) description += `\n\nTheme: ${data.THEME}`;
    if (data.CEFR) description += `\nCEFR Level: ${data.CEFR}`;
    if (data.MEANING_ORIGIN) description += `\nMeaning Origin: ${data.MEANING_ORIGIN}`;

    switch (normalizedModuleType) {
        case 'COURSE':
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
            break;
        default:
            console.warn(`mapFirestoreToClassroomBody: Unrecognized or skipped MODULETYPE: ${normalizedModuleType}.`);
    }

    if (data.IMAGEURL && (['VOCABULARY', 'GRAMMAR', 'READING-WRITING', 'LISTENINGSPEAKING', 'CONVERSATION' ].includes(normalizedModuleType))) {
        materials.push({
            link: {
                url: data.IMAGEURL,
                title: `${title} Image` 
            }
        });
    }

    if (data.audioUrl && (['VOCABULARY', 'LISTENINGSPEAKING', 'syllables', 'phonemes'].includes(normalizedModuleType))) { 
        materials.push({
            link: {
                url: data.audioUrl,
                title: `${title} Audio` 
            }
        });
    }

    return {
        title: title,
        description: description.trim(), 
        topicId: topicId, 
        materials: materials.length > 0 ? materials : undefined, 
    };
}

/**
 * Recursive function to traverse the Firestore module hierarchy and create corresponding
 * Google Classroom Topics and CourseWorkMaterials.
 */
async function processChildren(
    moduleIds,
    parentModuleType,
    classroomCourseId,
    currentClassroomTopicId,
    classroomApiInstance,
    processedModuleIds 
) {
    if (!moduleIds || moduleIds.length === 0) {
        return; 
    }

    for (const moduleId of moduleIds) {
        if (processedModuleIds.has(moduleId)) {
            console.log(`Skipping already processed module ID: ${moduleId}`);
            continue;
        }

        const moduleDoc = await getModuleDocument(moduleId, parentModuleType);

        if (!moduleDoc) {
            continue; 
        }

        const data = moduleDoc.data;
        const currentModuleType = moduleDoc.moduleType; 
        let effectiveClassroomTopicId = currentClassroomTopicId; 

        console.log(`Processing module ${currentModuleType}/${moduleId} (Parent Topic: ${currentClassroomTopicId || 'None'})`);

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
                if (data.MODULEID_ARRAY && data.MODULEID_ARRAY.length > 0) {
                   console.warn(`Skipping children of ${currentModuleType}/${moduleId} due to topic creation failure.`);
                }
                continue;
            }
        }

        processedModuleIds.add(moduleId);

        const requestBody = mapFirestoreToClassroomBody(data, currentModuleType, effectiveClassroomTopicId);

        if (requestBody) {
            try {
                await classroomApiInstance.courses.courseWorkMaterials.create({
                    courseId: classroomCourseId,
                    requestBody: requestBody,
                });
                console.log(`--> Created Classroom CourseWorkMaterial: "${requestBody.title}" for ${currentModuleType}/${moduleId}`);
            } catch (error) {
                console.error(`Failed to create Classroom material for ${currentModuleType}/${moduleId}. Error:`, error.errors ? JSON.stringify(error.errors) : error.message);
            }
        }

        if (currentModuleType === 'VOCABULARY_GROUP' && data.MODULEID_ARRAY && data.MODULEID_ARRAY.length > 0) {
            console.log(`Processing direct VOCABULARY children for VOCABULARY_GROUP: ${data.TITLE}`);
            for (const vocabId of data.MODULEID_ARRAY) {
                if (processedModuleIds.has(vocabId)) {
                    console.log(`Skipping already processed VOCABULARY ID: ${vocabId} (as child of VOCABULARY_GROUP)`);
                    continue;
                }

                const vocabDoc = await getModuleDocument(vocabId, 'VOCABULARY_GROUP'); 

                if (vocabDoc && vocabDoc.moduleType === 'VOCABULARY') {
                    processedModuleIds.add(vocabId);

                    const vocabRequestBody = mapFirestoreToClassroomBody(vocabDoc.data, vocabDoc.moduleType, effectiveClassroomTopicId);
                    if (vocabRequestBody) {
                        try {
                            await classroomApiInstance.courses.courseWorkMaterials.create({
                                courseId: classroomCourseId,
                                requestBody: vocabRequestBody,
                            });
                            console.log(`----> Created Classroom CourseWorkMaterial for VOCABULARY: "${vocabRequestBody.title}"`);
                        } catch (error) {
                            console.error(`Failed to create Classroom material for VOCABULARY ${vocabId}. Error:`, error.errors ? JSON.stringify(error.errors) : error.message);
                        }
                    }

                    if (vocabDoc.data.MODULEID_ARRAY && vocabDoc.data.MODULEID_ARRAY.length > 0) {
                        await processChildren(
                            vocabDoc.data.MODULEID_ARRAY,
                            vocabDoc.moduleType, 
                            classroomCourseId,
                            effectiveClassroomTopicId, 
                            classroomApiInstance,
                            processedModuleIds 
                        );
                    }
                } else {
                    console.warn(`Child ID ${vocabId} of VOCABULARY_GROUP was not a VOCABULARY document or not found. Skipping.`);
                }
            }
        }
      
        if (data.MODULEID_ARRAY && data.MODULEID_ARRAY.length > 0) {
            if (currentModuleType !== 'VOCABULARY_GROUP') { 
                await processChildren(
                    data.MODULEID_ARRAY,
                    currentModuleType, 
                    classroomCourseId,
                    effectiveClassroomTopicId, 
                    classroomApiInstance,
                    processedModuleIds 
                );
            } else { 
                console.log(`Skipping general recursion for VOCABULARY_GROUP ${data.TITLE} as its subtree was handled directly.`);
            }
        }
    }
}


// --- The actual Cloud Function (with Secret Manager binding) ---
export const generateCourseForClassroom = regionalFunctions // <--- CHANGE THIS!
    .runWith({ 
        timeoutSeconds: 540,
        secrets: ["GOOGLE_CLIENT_SECRET"] // Safely decrypts your Google Client Secret at runtime [1.1.5]
    })
    .https.onCall(async (data, context) => {

        if (!context.auth) {
            throw new functions.https.HttpsError(
                'unauthenticated',
                'The function must be called while authenticated.'
            );
        }
        const firebaseAuthUid = context.auth.uid; 

        const courseId = data.courseId;
        const authorizationCode = data.authorizationCode;

        if (!courseId || typeof courseId !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a valid "courseId" argument.');
        }

        try {
            const courseRef = db.collection('COURSE').doc(courseId);
            const courseDoc = await courseRef.get();

            if (!courseDoc.exists) {
                throw new functions.https.HttpsError('not-found', `Course with ID ${courseId} not found in Firestore.`);
            }
            const courseData = courseDoc.data();

            if (courseData.classroomExported === true) {
                console.log(`Course ${courseId} already marked as exported to Classroom. Returning success.`);
                return { success: true, message: `Course '${courseData.TITLE || courseData.name || courseId}' content already exported to Google Classroom.`, classroomCourseId: courseData.classroomCourseId };
            }

            const userTokensRef = db.collection('userClassroomTokens').doc(firebaseAuthUid);
            let userTokens = (await userTokensRef.get()).data();
            const oAuth2Client = getOAuth2Client();

            if (authorizationCode && (!userTokens || !userTokens.refreshToken)) {
                console.log(`[${firebaseAuthUid}] Exchanging authorization code for tokens...`);
                const { tokens } = await oAuth2Client.getToken(authorizationCode);
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
                await userTokensRef.set(userTokens); 
                console.log(`[${firebaseAuthUid}] Tokens acquired and refresh token stored.`);
                oAuth2Client.setCredentials({
                    access_token: userTokens.accessToken,
                    refresh_token: userTokens.refreshToken, 
                    expiry_date: userTokens.expiryDate
                });

            } else if (userTokens && userTokens.refreshToken) {
                console.log(`[${firebaseAuthUid}] Refresh token found. Attempting to set credentials.`);
                oAuth2Client.setCredentials({
                    refresh_token: userTokens.refreshToken,
                    access_token: userTokens.accessToken 
                });

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
                        await userTokensRef.delete(); 
                        throw new functions.https.HttpsError(
                            'unauthenticated',
                            'Your Google Classroom authorization has expired or been revoked. Please re-authorize through the app.'
                        );
                    }
                } else {
                    console.log(`[${firebaseAuthUid}] Using existing valid access token.`);
                }
            } else {
                console.error(`[${firebaseAuthUid}] No authorization code or refresh token found.`);
                throw new functions.https.HttpsError(
                    'failed-precondition',
                    'Google Classroom authorization is required. Please re-authorize through the app.'
                );
            }

            const classroom = google.classroom({ version: 'v1', auth: oAuth2Client });

            let classroomCourseId = courseData.classroomCourseId; 

            if (!classroomCourseId) {
                const newCourseDetails = {
                    name: courseData.TITLE || courseData.name || `Firebase Course: ${courseId}`, 
                    section: courseData.section || 'Generated via App',
                    descriptionHeading: courseData.DESCRIPTION || courseData.description || 'Content created from Firebase Learning App.',
                    ownerId: 'me', 
                    courseState: 'PROVISIONED', 
                };

                console.log(`[${firebaseAuthUid}] Attempting to create Google Classroom course for courseId: ${courseId}`);
                const createdClassroomCourse = await classroom.courses.create({ requestBody: newCourseDetails });
                classroomCourseId = createdClassroomCourse.data.id;
                console.log(`[${firebaseAuthUid}] Google Classroom course created: ${createdClassroomCourse.data.name} (ID: ${classroomCourseId})`);
            } else {
                console.log(`[${firebaseAuthUid}] Course ${courseId} is already linked to Classroom ID: ${classroomCourseId}. Verifying existence.`);
                try {
                    await classroom.courses.get({ id: classroomCourseId });
                    console.log(`[${firebaseAuthUid}] Existing Classroom course ${classroomCourseId} confirmed.`);
                } catch (getCourseError) {
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

            const processedModuleIdsForRun = new Set(); 

            console.log(`[${firebaseAuthUid}] Starting recursive export of child modules for Classroom Course ID: ${classroomCourseId}`);
            if (courseData.MODULEID_ARRAY && courseData.MODULEID_ARRAY.length > 0) {
                await processChildren(
                    courseData.MODULEID_ARRAY,
                    'COURSE', 
                    classroomCourseId,
                    null, 
                    classroom, 
                    processedModuleIdsForRun 
                );
                console.log(`[${firebaseAuthUid}] Finished recursive export of child modules.`);
            } else {
                console.log(`[${firebaseAuthUid}] No child modules (MODULEID_ARRAY) found for course ${courseId}.`);
            }

            await db.collection('COURSE').doc(courseId).update({
                classroomExported: true, 
                classroomCourseId: classroomCourseId, 
                exportedAt: FieldValue.serverTimestamp(), 
            });

            return {
                status: 'success',
                message: `Course '${courseData.TITLE || courseData.name || courseId}' and all its content successfully exported to Google Classroom!`,
                classroomCourseId: classroomCourseId 
            };

        } catch (error) {
            console.error(`[${firebaseAuthUid}] Error in generateCourseForClassroom:`, error);

            if (error.response && error.response.data && error.response.data.error) {
                const apiError = error.response.data.error; 
                console.error(`[${firebaseAuthUid}] Google API Error Details:`, JSON.stringify(apiError));

                if (apiError.error === 'invalid_grant' || (apiError.error_description && apiError.error_description.includes('Token has been revoked'))) {
                    const userTokensRef = db.collection('userClassroomTokens').doc(firebaseAuthUid);
                    await userTokensRef.delete(); 
                    throw new functions.https.HttpsError(
                        'unauthenticated',
                        'Your Google Classroom authorization has expired or been revoked. Please re-authorize through the app.'
                    );
                }
                throw new functions.https.HttpsError(
                    'internal',
                    `Google Classroom API error: ${apiError.message || apiError.error_description || 'Unknown API error'}. Please check permissions.`,
                    apiError
                );
            }
            else if (error.message && error.message.includes('redirect_uri_mismatch')) {
                 throw new functions.https.HttpsError(
                    'invalid-argument',
                    'OAuth redirect URI mismatch. Ensure your Firebase Hosting URL is correctly configured in Google Cloud Console OAuth Client ID.',
                    error.message
                );
            }
            else if (error.code) { 
                throw error;
            }
            else {
                throw new functions.https.HttpsError(
                    'internal',
                    'Failed to integrate course with Google Classroom due to an unexpected error.',
                    error.message
                );
            }
        }
    });
