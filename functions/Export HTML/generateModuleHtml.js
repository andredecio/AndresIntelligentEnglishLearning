// generateModuleHtml version v1.001a 20/10/2025
import * as functions from "firebase-functions/v1";
import { regionalFunctions } from "../config.js"; // <--- ADD THIS LINE!
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Ensure Firebase Admin SDK is initialized
if (getApps().length === 0) {
    initializeApp();
}

const firestore = getFirestore();
const bucket = getStorage().bucket();

// --- Configuration Constants ---
const ADMIN_UID = "WxGARaxfYcQCrR7YXBn6jcmf8Ix2"; 

// Base costs for operations
const CLOUD_FUNCTION_BASE_COST = 0.000008; 
const FIRESTORE_READ_COST_PER_DOC = 0.000006;
const FIRESTORE_WRITE_COST_PER_DOC = 0.00002;
const CLOUD_STORAGE_WRITE_COST_PER_MB = 0.000026; 
const CLOUD_STORAGE_READ_COST_PER_MB = 0.00001;

// --- Helper Function for Cost Estimation for HTML Generation ---
function calculateEstimatedHtmlGenerationCost(moduleType, contentItemCount = 0) {
    let firestoreReadCost = FIRESTORE_READ_COST_PER_DOC; 

    if (moduleType === 'LESSON') {
        firestoreReadCost += contentItemCount * FIRESTORE_READ_COST_PER_DOC;
    } else if (moduleType === 'COURSE') {
        firestoreReadCost += contentItemCount * (FIRESTORE_READ_COST_PER_DOC + (5 * FIRESTORE_READ_COST_PER_DOC));
    }

    const functionCost = CLOUD_FUNCTION_BASE_COST;
    const cloudStorageCost = CLOUD_STORAGE_WRITE_COST_PER_MB * 0.01;
    const firestoreWriteCost = FIRESTORE_WRITE_COST_PER_DOC;

    const totalEstimatedCost = functionCost + firestoreReadCost + cloudStorageCost + firestoreWriteCost;
    functions.logger.debug(`Estimated cost for generating HTML for ${moduleType} with ${contentItemCount} items: ${totalEstimatedCost.toFixed(6)}`);

    return totalEstimatedCost;
}

// --- Internal HTML Generation Helpers ---

function _generateLearningContentHtml(contentItem) {
    let html = `<section class="learning-content-item">`;
    html += `  <h3 class="content-type">${contentItem.MODULETYPE || 'N/A'}</h3>`;
    html += `  <h4 class="content-title">${contentItem.TITLE || 'Untitled'}</h4>`;

    let descriptionContent = '';

    if (contentItem.MODULETYPE === 'VOCABULARY_GROUP') {
        descriptionContent += `<p><strong>Meaning/Origin:</strong> ${contentItem.MEANING_ORIGIN || 'No meaning/origin provided for group.'}</p>`;
    } else if (contentItem.MODULETYPE === 'VOCABULARY') {
        if (contentItem.MEANING_ORIGIN) {
            descriptionContent += `<p><strong>Meaning/Origin:</strong> ${contentItem.MEANING_ORIGIN}</p>`;
        }
        if (contentItem.WORD_TYPE) {
            descriptionContent += `<p><strong>Word Type:</strong> ${contentItem.WORD_TYPE}</p>`;
            if (contentItem.WORD_TYPE.toLowerCase() === 'verb') {
                if (contentItem.PRESENT_SIMPLE_3RD_PERSON_SINGULAR) descriptionContent += `<p class="indent"><strong>Present Simple 3rd Person Singular:</strong> ${contentItem.PRESENT_SIMPLE_3RD_PERSON_SINGULAR}</p>`;
                if (contentItem.SIMPLE_PAST) descriptionContent += `<p class="indent"><strong>Simple Past:</strong> ${contentItem.SIMPLE_PAST}</p>`;
                if (contentItem.PAST_PARTICIPLE) descriptionContent += `<p class="indent"><strong>Past Participle:</strong> ${contentItem.PAST_PARTICIPLE}</p>`;
            }
        }
        if (contentItem.IPA) {
            descriptionContent += `<p><strong>IPA:</strong> /${contentItem.IPA}/</p>`;
        }
        if (contentItem.DESCRIPTION) {
            descriptionContent += `<p><strong>Examples:</strong></p>`;
            let examples = contentItem.DESCRIPTION || 'No examples provided.';
            examples = examples.replace(/([^\n])(\d+\.\s)/g, '$1\n$2');
            if (examples.startsWith('\n')) {
                examples = examples.substring(1);
            }
            descriptionContent += `<p>${examples.replace(/\n/g, '<br>')}</p>`; 
        }
    } else { 
        let description = contentItem.DESCRIPTION || 'No description provided.';
        if (contentItem.MODULETYPE === 'LISTENINGSPEAKING') {
            description = description
                .replace(/<speak>/g, '')
                .replace(/<\/speak>/g, '')
                .replace(/<break time='[^']+'\/>/g, '')
                .replace(/<prosody[^>]*>/g, '')
                .replace(/<\/prosody>/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }
        if (contentItem.MODULETYPE === 'CONVERSATION') {
            description = description.replace(/(\n|^)(Person [A-Z]:|Person [A-Z]:)/g, '\n$2');
            if (description.startsWith('\n')) {
                description = description.substring(1);
            }
        }
        description = description.replace(/([^\n])(\d+\.\s)/g, '$1\n$2');
        descriptionContent += `<p><strong>Description:</strong></p><p>${description.replace(/\n/g, '<br>')}</p>`; 
    }

    html += descriptionContent;

    if (contentItem.IMAGEURL) {
        html += `<div class="content-media"><img src="${contentItem.IMAGEURL}" alt="${contentItem.TITLE || 'Untitled'} Image"></div>`;
    }
    if (contentItem.audioUrl) {
        html += `<div class="content-media"><audio controls src="${contentItem.audioUrl}"></audio></div>`;
    }

    html += `</section>`;
    return html;
}

function _generateLessonHtmlContent(lessonId, lessonData, learningContents) {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${lessonData.TITLE || 'Untitled Lesson'}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; color: #333; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; background-color: #fff; }
        h1 { color: #053D73; margin-bottom: 10px; }
        h2 { color: #0C6295; margin-top: 25px; margin-bottom: 8px; }
        h3 { color: #1B95B8; margin-top: 20px; margin-bottom: 6px; }
        h4 { color: #555; margin-top: 15px; margin-bottom: 5px; }
        p { margin-bottom: 10px; }
        .lesson-info { font-size: 0.9em; color: #666; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 15px; }
        .learning-content-item { border-left: 4px solid #F0A000; padding-left: 15px; margin-bottom: 25px; background-color: #fcfcfc; padding-top: 10px; padding-bottom: 10px; border-radius: 4px; }
        .learning-content-item:last-child { margin-bottom: 0; }
        .content-media { margin-top: 15px; margin-bottom: 15px; text-align: center; }
        .content-media img { max-width: 100%; height: auto; border-radius: 4px; border: 1px solid #eee; }
        .content-media audio { width: 100%; max-width: 400px; }
        .indent { margin-left: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${lessonData.TITLE || 'Untitled Lesson'}</h1>
        <div class="lesson-info">
            <p><strong>Lesson ID:</strong> ${lessonId}</p>
            <p><strong>Theme:</strong> ${lessonData.THEME || 'N/A'}</p>
            <p><strong>CEFR Level:</strong> ${lessonData.CEFR_LEVEL || 'N/A'}</p>
        </div>
        
        <h2>Lesson Content</h2>
        ${learningContents.length > 0 ? learningContents.map(_generateLearningContentHtml).join('') : '<p>No learning content found for this lesson.</p>'}
    </div>
</body>
</html>`;
    return html;
}

function _generateCourseHtmlContent(courseId, courseData, lessonsHtmlData) {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${courseData.TITLE || 'Untitled Course'}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; color: #333; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; background-color: #fff; }
        h1 { color: #053D73; margin-bottom: 10px; }
        h2 { color: #0C6295; margin-top: 25px; margin-bottom: 8px; }
        p { margin-bottom: 10px; }
        .course-info { font-size: 0.9em; color: #666; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 15px; }
        .lesson-list ul { list-style-type: none; padding: 0; }
        .lesson-list li { margin-bottom: 10px; background-color: #f5f5f5; padding: 10px 15px; border-radius: 4px; border-left: 3px solid #1B95B8; }
        .lesson-list li a { text-decoration: none; color: #053D73; font-weight: bold; }
        .lesson-list li a:hover { text-decoration: underline; color: #0C6295; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${courseData.TITLE || 'Untitled Course'}</h1>
        <div class="course-info">
            <p><strong>Course ID:</strong> ${courseId}</p>
            <p>${courseData.DESCRIPTION || 'No description provided.'}</p>
        </div>
        
        <h2>Lessons in this Course:</h2>
        <div class="lesson-list">
            ${lessonsHtmlData.length > 0 ? `<ul>${lessonsHtmlData.map(lesson => `<li><a href="${lesson.htmlUrl}">${lesson.title} (ID: ${lesson.lessonId})</a></li>`).join('')}</ul>` : '<p>No lessons found for this course.</p>'}
        </div>
    </div>
</body>
</html>`;
    return html;
}

// --- The actual Cloud Function ---
export const generateModuleHtml = regionalFunctions.runWith({ timeoutSeconds: 540, memory: '256MB' }).https.onCall(async (data, context) => { // <--- CHANGE THIS!
    const currentUserUid = context.auth?.uid;

    if (!currentUserUid) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const customClaims = context.auth.token;
    const isAdmin = customClaims.admin === true;

    if (!isAdmin) {
        functions.logger.info(`User ${currentUserUid} is not an admin. Proceeding to transactional credit/limit check.`);
    } else {
        functions.logger.debug(`User ${currentUserUid} is an ADMIN. Bypassing transactional credit/limit check.`);
    }

    const { moduleId, moduleType } = data;

    if (!moduleId || !moduleType || (moduleType !== 'LESSON' && moduleType !== 'COURSE')) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Module ID and a valid Module Type (LESSON or COURSE) are required.'
        );
    }

    functions.logger.info(`User ${currentUserUid}: Starting HTML generation for ${moduleType} ID: ${moduleId}`);

    let mainModuleDocRef = firestore.collection(moduleType).doc(moduleId);
    let mainModuleDoc = await mainModuleDocRef.get();

    if (!mainModuleDoc.exists) {
        throw new functions.https.HttpsError('not-found', `${moduleType} with ID ${moduleId} not found.`);
    }

    const mainModuleData = mainModuleDoc.data();
    let finalEstimatedCost = 0;
    let publicUrlForFirestore = null;
    let temporarySignedUrl = null;

    if (mainModuleData.htmlUrl) {
        functions.logger.info(`User ${currentUserUid}: ${moduleType} ${moduleId} already has an HTML URL. Returning existing one.`);
        const [existingSignedUrl] = await bucket.file(`${moduleType.toLowerCase()}s/${moduleId}/${moduleId}.html`).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, version: 'v4' });
        return { success: true, downloadUrl: existingSignedUrl };
    }

    try {
        if (moduleType === 'LESSON') {
            const learningContentIds = mainModuleData.MODULEID_ARRAY || [];
            functions.logger.debug(`[LESSON:${moduleId}] MODULEID_ARRAY = ${JSON.stringify(learningContentIds)}`);

            const contentPromises = learningContentIds.map(async id => {
                const doc = await firestore.collection('learningContent').doc(id).get();
                if (doc.exists) {
                    const contentData = doc.data();
                    return contentData;
                }
                functions.logger.warn(`[LESSON:${moduleId}] LearningContent document with ID ${id} not found.`);
                return null;
            });
            const learningContents = (await Promise.all(contentPromises)).filter(item => item !== null);

            finalEstimatedCost = calculateEstimatedHtmlGenerationCost('LESSON', learningContents.length);

            if (!isAdmin) {
                await firestore.runTransaction(async (transaction) => {
                    const userRef = firestore.collection('users').doc(currentUserUid);
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists) { throw new functions.https.HttpsError('not-found', 'User profile not found.'); }
                    const userProfile = userDoc.data();
                    const paymentPlanRef = firestore.collection('paymentPlans').doc(userProfile.planid);
                    const paymentPlanDoc = await transaction.get(paymentPlanRef);
                    if (!paymentPlanDoc.exists) { throw new functions.https.HttpsError('failed-precondition', 'Invalid payment plan assigned to user.'); }
                    const paymentPlan = paymentPlanDoc.data();
                    let currentBalance = userProfile.currentBalance || 0;
                    if (currentBalance < finalEstimatedCost) {
                        throw new functions.https.HttpsError('resource-exhausted', `Insufficient funds. Current balance: ${currentBalance.toFixed(2)}. Estimated cost: ${finalEstimatedCost.toFixed(2)}.`);
                    }
                    const operationCountForLimit = 1;
                    if (paymentPlan.type !== 'PayAsYouGo' && paymentPlan.moduleCreationLimit !== null) {
                        let modulesCreatedThisMonth = userProfile.modulesCreatedThisMonth || 0;
                        let lastBillingCycleReset = userProfile.lastBillingCycleReset ? userProfile.lastBillingCycleReset.toDate() : null;
                        const now = new Date();
                        let shouldReset = false;
                        if (!lastBillingCycleReset || (paymentPlan.type === 'Monthly' && (now.getMonth() !== lastBillingCycleReset.getMonth() || now.getFullYear() !== lastBillingCycleReset.getFullYear())) || (paymentPlan.type === 'Yearly' && (now.getFullYear() !== lastBillingCycleReset.getFullYear()))) {
                            shouldReset = true;
                        }
                        if (shouldReset) {
                            modulesCreatedThisMonth = 0;
                            lastBillingCycleReset = Timestamp.fromDate(now);
                        }
                        if (modulesCreatedThisMonth + operationCountForLimit > paymentPlan.moduleCreationLimit) {
                            throw new functions.https.HttpsError('resource-exhausted', `Monthly operation limit reached. You have performed ${modulesCreatedThisMonth} out of ${paymentPlan.moduleCreationLimit} operations.`);
                        }
                        userProfile.modulesCreatedThisMonth = modulesCreatedThisMonth + operationCountForLimit;
                        userProfile.lastBillingCycleReset = lastBillingCycleReset;
                    }

                    transaction.update(userRef, {
                        currentBalance: currentBalance - finalEstimatedCost,
                        modulesCreatedThisMonth: userProfile.modulesCreatedThisMonth,
                        lastBillingCycleReset: userProfile.lastBillingCycleReset
                    });
                    functions.logger.info(`User ${currentUserUid}: Deducted ${finalEstimatedCost.toFixed(6)}. New balance: ${(currentBalance - finalEstimatedCost).toFixed(2)}.`);
                });
            } else {
                functions.logger.info(`User ${currentUserUid} is an ADMIN. Bypassing transactional credit/limit check.`);
            }

            const lessonHtmlContent = _generateLessonHtmlContent(moduleId, mainModuleData, learningContents);

            const storagePath = `html/lessons/${moduleId}/${moduleId}.html`;
            const fileRef = bucket.file(storagePath);
            await fileRef.save(lessonHtmlContent, {
                contentType: 'text/html',
                cacheControl: 'public, max-age=31536000',
            });
            await fileRef.makePublic();
            [temporarySignedUrl] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, version: 'v4' });
            publicUrlForFirestore = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

            await mainModuleDocRef.update({ htmlUrl: publicUrlForFirestore });
            functions.logger.info(`User ${currentUserUid}: Successfully generated and linked HTML for LESSON ID: ${moduleId}`);

        } else if (moduleType === 'COURSE') {
            const lessonIds = mainModuleData.MODULEID_ARRAY || [];
            functions.logger.debug(`[COURSE:${moduleId}] MODULEID_ARRAY (lesson IDs) = ${JSON.stringify(lessonIds)}`);

            let lessonsHtmlData = [];
            if (lessonIds.length > 0) {
                const lessonPromises = lessonIds.map(async lessonId => {
                    const lessonDoc = await firestore.collection('LESSON').doc(lessonId).get();
                    if (!lessonDoc.exists) {
                        functions.logger.warn(`[COURSE:${moduleId}] Lesson ${lessonId} referenced by Course not found.`);
                        return null;
                    }
                    const lessonData = lessonDoc.data();
                    let lessonHtmlUrl = lessonData.htmlUrl;

                    if (!lessonHtmlUrl) {
                        functions.logger.info(`[COURSE:${moduleId}] Lesson ${lessonId} does not have existing HTML. Generating it now.`);
                        const learningContentIds = lessonData.MODULEID_ARRAY || [];
                        const contentPromises = learningContentIds.map(async id => {
                            const doc = await firestore.collection('learningContent').doc(id).get();
                            return doc.exists ? doc.data() : null;
                        });
                        const learningContents = (await Promise.all(contentPromises)).filter(item => item !== null);

                        const htmlContent = _generateLessonHtmlContent(lessonId, lessonData, learningContents);
                        const lessonStoragePath = `html/lessons/${lessonId}/${lessonId}.html`;
                        const lessonFileRef = bucket.file(lessonStoragePath);
                        await lessonFileRef.save(htmlContent, { contentType: 'text/html', cacheControl: 'public, max-age=31536000' });
                        await lessonFileRef.makePublic();
                        lessonHtmlUrl = `https://storage.googleapis.com/${bucket.name}/${lessonStoragePath}`;
                        await firestore.collection('LESSON').doc(lessonId).update({ htmlUrl: lessonHtmlUrl });
                        functions.logger.info(`[COURSE:${moduleId}] Generated and linked HTML for sub-LESSON ID: ${lessonId}`);
                    }
                    return { lessonId: lessonId, title: lessonData.TITLE || `Untitled Lesson ${lessonId}`, htmlUrl: lessonHtmlUrl };
                });
                lessonsHtmlData = (await Promise.all(lessonPromises)).filter(item => item !== null);
            }

            finalEstimatedCost = calculateEstimatedHtmlGenerationCost('COURSE', lessonsHtmlData.length);

            if (!isAdmin) {
                await firestore.runTransaction(async (transaction) => {
                    const userRef = firestore.collection('users').doc(currentUserUid);
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists) { throw new functions.https.HttpsError('not-found', 'User profile not found.'); }
                    const userProfile = userDoc.data();
                    const paymentPlanRef = firestore.collection('paymentPlans').doc(userProfile.planid);
                    const paymentPlanDoc = await transaction.get(paymentPlanRef);
                    if (!paymentPlanDoc.exists) { throw new functions.https.HttpsError('failed-precondition', 'Invalid payment plan assigned to user.'); }
                    const paymentPlan = paymentPlanDoc.data();
                    let currentBalance = userProfile.currentBalance || 0;
                    if (currentBalance < finalEstimatedCost) {
                        throw new functions.https.HttpsError('resource-exhausted', `Insufficient funds. Current balance: ${currentBalance.toFixed(2)}. Estimated cost: ${finalEstimatedCost.toFixed(2)}.`);
                    }
                    const operationCountForLimit = 1;
                    if (paymentPlan.type !== 'PayAsYouGo' && paymentPlan.moduleCreationLimit !== null) {
                        let modulesCreatedThisMonth = userProfile.modulesCreatedThisMonth || 0;
                        let lastBillingCycleReset = userProfile.lastBillingCycleReset ? userProfile.lastBillingCycleReset.toDate() : null;
                        const now = new Date();
                        let shouldReset = false;
                        if (!lastBillingCycleReset || (paymentPlan.type === 'Monthly' && (now.getMonth() !== lastBillingCycleReset.getMonth() || now.getFullYear() !== lastBillingCycleReset.getFullYear())) || (paymentPlan.type === 'Yearly' && (now.getFullYear() !== lastBillingCycleReset.getFullYear()))) {
                            shouldReset = true;
                        }
                        if (shouldReset) {
                            modulesCreatedThisMonth = 0;
                            lastBillingCycleReset = Timestamp.fromDate(now);
                        }
                        if (modulesCreatedThisMonth + operationCountForLimit > paymentPlan.moduleCreationLimit) {
                            throw new functions.https.HttpsError('resource-exhausted', `Monthly operation limit reached. You have performed ${modulesCreatedThisMonth} out of ${paymentPlan.moduleCreationLimit} operations.`);
                        }
                        userProfile.modulesCreatedThisMonth = modulesCreatedThisMonth + operationCountForLimit;
                        userProfile.lastBillingCycleReset = lastBillingCycleReset;
                    }

                    transaction.update(userRef, {
                        currentBalance: currentBalance - finalEstimatedCost,
                        modulesCreatedThisMonth: userProfile.modulesCreatedThisMonth,
                        lastBillingCycleReset: userProfile.lastBillingCycleReset
                    });
                    functions.logger.info(`User ${currentUserUid}: Deducted ${finalEstimatedCost.toFixed(6)}. New balance: ${(currentBalance - finalEstimatedCost).toFixed(2)}.`);
                });
            } else {
                functions.logger.info(`User ${currentUserUid} is an ADMIN. Bypassing transactional credit/limit check.`);
            }

            const courseHtmlContent = _generateCourseHtmlContent(moduleId, mainModuleData, lessonsHtmlData);

            const storagePath = `html/courses/${moduleId}/${moduleId}.html`;
            const fileRef = bucket.file(storagePath);
            await fileRef.save(courseHtmlContent, {
                contentType: 'text/html',
                cacheControl: 'public, max-age=31536000',
            });
            await fileRef.makePublic();
            [temporarySignedUrl] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, version: 'v4' });
            publicUrlForFirestore = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

            await mainModuleDocRef.update({ htmlUrl: publicUrlForFirestore });
            functions.logger.info(`User ${currentUserUid}: Successfully generated and linked HTML for COURSE ID: ${moduleId}`);
        }

    } catch (error) {
        functions.logger.error(`User ${currentUserUid}: Error generating or uploading HTML for ${moduleType} ${moduleId}:`, error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', `An unexpected error occurred during HTML generation for ${moduleType}.`, error.message);
    }

    return { success: true, downloadUrl: temporarySignedUrl };
});
