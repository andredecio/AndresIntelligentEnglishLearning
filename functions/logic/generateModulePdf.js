const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const os = require('os');
const path = require('path');
const fs = require('fs').promises; // Ensure fs.promises is available

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

// Ensure Firebase Admin SDK is initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

// --- Configuration Constants ---
const ADMIN_UID = "WxGARaxfYcQCrR7YXBn6jcmf8Ix2"; // Your admin UID

// Base costs for operations (adjust as needed based on actual usage/pricing)
const CLOUD_FUNCTION_BASE_COST = 0.00001; // Example: low fixed cost per function invocation
const FIRESTORE_READ_COST_PER_DOC = 0.000006; // Example: approx cost per read
const FIRESTORE_WRITE_COST_PER_DOC = 0.00002; // Example: approx cost per write (for updating URL)
const CLOUD_STORAGE_WRITE_COST_PER_MB = 0.000026; // Example: approx cost per MB (adjust for actual PDF size)
const CLOUD_STORAGE_READ_COST_PER_MB = 0.00001; // Example: approx cost per MB for reading existing PDFs

// PDF Styling Constants
const MARGIN = 50;
const FONT_SIZE_BODY = 11;
const FONT_SIZE_SMALL = 9;
const LINE_HEIGHT_BODY = 16; // Vertical advancement per line for body text
const HEADER_FONT_SIZE = 24;
const SUBHEADER_FONT_SIZE = 16;


// --- Helper Function for Cost Estimation for PDF Generation ---
/**
 * Estimates the total cost in the base currency for generating a PDF for a module (Lesson or Course).
 * This includes Cloud Function execution, Firestore reads for content, and Cloud Storage write for the PDF.
 * @param {string} moduleType - 'LESSON' or 'COURSE'
 * @param {number} contentItemCount - Number of associated learningContent items or lessons.
 * @returns {number} Estimated cost in base currency.
 */
function calculateEstimatedPdfGenerationCost(moduleType, contentItemCount = 0) {
    let firestoreReadCost = FIRESTORE_READ_COST_PER_DOC; // For the main module (Lesson/Course) itself

    if (moduleType === 'LESSON') {
        // Reads for each learningContent item associated with the lesson
        firestoreReadCost += contentItemCount * FIRESTORE_READ_COST_PER_DOC;
    } else if (moduleType === 'COURSE') {
        // Reads for each Lesson associated with the Course, and then each of their learningContent items
        // This is a rough estimation; actual reads depend on how deep you go.
        // For simplicity, let's assume 1 Course doc + N Lesson docs
        firestoreReadCost += contentItemCount * contentItemCount * FIRESTORE_READ_COST_PER_DOC; // Changed this line assuming lessons also have some content items. Adjust if needed.
    }

    // Fixed cost for Cloud Function execution (covers CPU/memory for PDF generation)
    const functionCost = CLOUD_FUNCTION_BASE_COST * 2; // Slightly higher as it's more intensive

    // Cost for Cloud Storage for the PDF (assuming a small PDF, e.g., 0.1MB)
    const cloudStorageCost = CLOUD_STORAGE_WRITE_COST_PER_MB * 0.1;

    // Cost for updating the module document with the PDF URL
    const firestoreWriteCost = FIRESTORE_WRITE_COST_PER_DOC;

    const totalEstimatedCost = functionCost + firestoreReadCost + cloudStorageCost + firestoreWriteCost;

    functions.logger.debug(`Estimated cost for generating PDF for ${moduleType} with ${contentItemCount} items: ${totalEstimatedCost.toFixed(6)}`);

    return totalEstimatedCost;
}

// --- Internal PDF Generation Helpers ---

/**
 * Helper to add text to a PDF page, handling new pages and manual word wrapping.
 * @param {PDFPage} page The current PDF page.
 * @param {string} text The text to add.
 * @param {object} options PDF drawing options.
 * @param {number} currentYPosition The current Y position (top of the text block).
 * @param {object} fonts Object containing font references.
 * @param {PDFDocument} pdfDoc The PDFDocument instance.
 * @returns {{newYPosition: number, newPage: PDFPage}} The updated Y position and page.
 */
async function addTextToPdfPage(page, text, options, currentYPosition, fonts, pdfDoc) {
    const defaultOptions = {
        font: fonts.font,
        size: FONT_SIZE_BODY,
        color: rgb(0, 0, 0),
        lineHeight: LINE_HEIGHT_BODY, // This is the vertical advancement per line
        maxWidth: page.getWidth() - 2 * MARGIN,
    };
    const combinedOptions = { ...defaultOptions, ...options };

    const paragraphs = text.split('\n'); // Treat explicit newlines as separate paragraphs

    for (const paragraph of paragraphs) {
        if (!paragraph.trim()) { // If an explicit blank line/empty paragraph
            currentYPosition -= combinedOptions.lineHeight / 2; // Add half a line of space
            continue;
        }

        const words = paragraph.split(' ');
        let currentLine = '';
        const linesToDraw = [];

        // Manual word wrapping logic to break text into lines that fit maxWidth
        for (const word of words) {
            const testLine = currentLine === '' ? word : `${currentLine} ${word}`;
            try {
                const testLineWidth = combinedOptions.font.widthOfTextAtSize(testLine, combinedOptions.size);

                if (testLineWidth <= combinedOptions.maxWidth) {
                    currentLine = testLine;
                } else {
                    if (currentLine === '') { // Special case: a single word is longer than maxWidth
                        // For now, we'll draw the single word and let it overflow.
                        // For robust handling, one might break the word itself or hyphenate.
                        linesToDraw.push(word);
                        currentLine = '';
                    } else {
                        linesToDraw.push(currentLine);
                        currentLine = word;
                    }
                }
            } catch (e) {
                // Catch any font encoding errors during width calculation
                functions.logger.error(`Font encoding error for text segment: "${testLine}". Original error:`, e);
                // Fallback: treat line as-is, it might be drawn with missing chars or throw later.
                // Or, more robustly, replace unsupported chars with a placeholder like '?'
                linesToDraw.push(testLine);
                currentLine = ''; // Reset currentLine
            }
        }
        if (currentLine !== '') {
            linesToDraw.push(currentLine); // Add the last accumulated line
        }

        // Calculate the total height this paragraph (including its wrapped lines) will occupy
        const totalParagraphHeight = (linesToDraw.length * combinedOptions.lineHeight);

        // Check for page break *before* drawing any lines of this paragraph
        // Ensure there's enough space from currentYPosition down to the bottom margin for this entire block
        if (currentYPosition - totalParagraphHeight < MARGIN) {
            page = pdfDoc.addPage();
            currentYPosition = page.getHeight() - MARGIN; // Reset Y for new page
        }

        // Draw each wrapped line for the current paragraph
        for (const line of linesToDraw) {
            // `currentYPosition` is the top of the space where the line should start.
            // `drawText` uses `y` as the baseline. A common heuristic for the baseline
            // from the top of the text block is `currentYPosition - (font.size * 0.8)`.
            const baselineY = currentYPosition - (combinedOptions.size * 0.8);

            page.drawText(line, {
                x: MARGIN,
                y: baselineY,
                font: combinedOptions.font,
                size: combinedOptions.size,
                color: combinedOptions.color,
            });

            currentYPosition -= combinedOptions.lineHeight; // Advance y for the next line within this paragraph
        }
        currentYPosition -= 5; // Small vertical padding after each logical paragraph
    }
    return { newYPosition: currentYPosition, newPage: page };
}

/**
 * Helper to add image to a PDF page, handling new pages and scaling.
 * @param {PDFPage} page The current PDF page.
 * @param {Buffer} imageBuffer The image buffer.
 * @param {string} imageType 'png' or 'jpg'.
 * @param {number} currentYPosition The current Y position.
 * @param {PDFDocument} pdfDoc The PDFDocument instance.
 * @returns {{newYPosition: number, newPage: PDFPage}} The updated Y position and page.
 */
async function addImageToPdfPage(page, imageBuffer, imageType, currentYPosition, pdfDoc) {
    if (!imageBuffer || !imageType) return { newYPosition: currentYPosition, newPage: page };

    let embeddedImage;
    if (imageType === 'png') {
        embeddedImage = await pdfDoc.embedPng(imageBuffer);
    } else if (imageType === 'jpg') {
        embeddedImage = await pdfDoc.embedJpg(imageBuffer);
    } else {
        functions.logger.warn(`Could not embed image: Unsupported type ${imageType}`);
        return { newYPosition: currentYPosition, newPage: page };
    }

    const imageDims = embeddedImage.scaleToFit(page.getWidth() - 2 * MARGIN, page.getHeight() - 2 * MARGIN);

    if (currentYPosition - imageDims.height < MARGIN) { // If image won't fit, add new page
        page = pdfDoc.addPage();
        currentYPosition = page.getHeight() - MARGIN;
    }

    page.drawImage(embeddedImage, {
        x: MARGIN,
        y: currentYPosition - imageDims.height,
        width: imageDims.width,
        height: imageDims.height,
    });
    currentYPosition -= imageDims.height + 15; // Space after image

    return { newYPosition: currentYPosition, newPage: page };
}


/**
 * Generates the PDF content for a single lesson.
 * This helper does NOT handle uploads or Firestore updates directly, just returns PDF bytes and image fetches.
 *
 * @param {string} lessonId The ID of the lesson.
 * @param {object} lessonData The lesson document data.
 * @param {Array<object>} learningContents An array of learningContent data objects, potentially with `imageBuffer` and `imageType`.
 * @returns {Promise<Buffer>} The PDF bytes for the lesson.
 */
async function _generatePdfContentForLesson(lessonId, lessonData, learningContents) {
    const pdfDoc = await PDFDocument.create();

    let font, boldFont;
    try {
        const fontPath = path.join(process.cwd(), 'fonts', 'NotoSans-Regular.ttf');
        const boldFontPath = path.join(process.cwd(), 'fonts', 'NotoSans-Bold.ttf');
        
        functions.logger.debug(`Attempting to load font from: ${fontPath}`);
        const fontBytes = await fs.readFile(fontPath);
        font = await pdfDoc.embedFont(fontBytes);

        functions.logger.debug(`Attempting to load bold font from: ${boldFontPath}`);
        const boldFontBytes = await fs.readFile(boldFontPath);
        boldFont = await pdfDoc.embedFont(boldFontBytes);
    } catch (fontError) {
        functions.logger.error("Failed to load custom fonts. Falling back to StandardFonts (may not support all characters). Error:", fontError);
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }
    // --- End Font Loading ---

    let page = pdfDoc.addPage();
    let yPosition = page.getHeight() - MARGIN;

    const fonts = { font, boldFont };

    // Lesson Header - Removed "Lesson:" prefix
    let textResult = await addTextToPdfPage(page, `${lessonData.TITLE || 'Untitled'}`, { font: boldFont, size: HEADER_FONT_SIZE, color: rgb(0.05, 0.25, 0.45) }, yPosition, fonts, pdfDoc);
    yPosition = textResult.newYPosition; page = textResult.newPage;
    textResult = await addTextToPdfPage(page, `ID: ${lessonId}`, { font: font, size: FONT_SIZE_SMALL }, yPosition, fonts, pdfDoc);
    yPosition = textResult.newYPosition; page = textResult.newPage;
    textResult = await addTextToPdfPage(page, `Theme: ${lessonData.THEME || 'N/A'}`, { font: font, size: SUBHEADER_FONT_SIZE }, yPosition, fonts, pdfDoc);
    yPosition = textResult.newYPosition; page = textResult.newPage;
    textResult = await addTextToPdfPage(page, `CEFR Level: ${lessonData.CEFR_LEVEL || 'N/A'}`, { font: font, size: SUBHEADER_FONT_SIZE }, yPosition, fonts, pdfDoc);
    yPosition = textResult.newYPosition; page = textResult.newPage;

    yPosition -= 20;

    // Removed "Learning Content:" header as requested

    if (learningContents.length > 0) {
        for (const contentItem of learningContents) {
            // --- Vocabulary Module Specific Content ---
            if (contentItem.MODULETYPE === 'VOCABULARY') {
                // Vocabulary Group (Title) first
                textResult = await addTextToPdfPage(page, `${contentItem.TITLE || 'Untitled'}`, { font: boldFont, size: FONT_SIZE_BODY + 1 }, yPosition, fonts, pdfDoc);
                yPosition = textResult.newYPosition; page = textResult.newPage;

                // Then Meaning/Origin
                if (contentItem.MEANING_ORIGIN) {
                    textResult = await addTextToPdfPage(page, `Meaning/Origin: ${contentItem.MEANING_ORIGIN}`, { font: font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                    yPosition = textResult.newYPosition; page = textResult.newPage;
                }

                // Then Word Type and Verb Forms
                if (contentItem.WORDTYPE) {
                    textResult = await addTextToPdfPage(page, `Word Type: ${contentItem.WORDTYPE}`, { font: font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                    yPosition = textResult.newYPosition; page = textResult.newPage;

                    if (contentItem.WORDTYPE.toLowerCase() === 'verb') {
                        if (contentItem.PRESENT_SIMPLE_3PS) {
                            textResult = await addTextToPdfPage(page, `  Present Simple 3rd Person: ${contentItem.PRESENT_SIMPLE_3PS}`, { font: font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                            yPosition = textResult.newYPosition; page = textResult.newPage;
                        }
                        if (contentItem.PAST_SIMPLE) {
                            textResult = await addTextToPdfPage(page, `  Past Simple: ${contentItem.PAST_SIMPLE}`, { font: font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                            yPosition = textResult.newYPosition; page = textResult.newPage;
                        }
                        if (contentItem.PAST_PARTICIPLE) {
                            textResult = await addTextToPdfPage(page, `  Past Participle: ${contentItem.PAST_PARTICIPLE}`, { font: font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                            yPosition = textResult.newYPosition; page = textResult.newPage;
                        }
                    }
                }

                // Then Examples (DESCRIPTION)
                if (contentItem.DESCRIPTION) {
                    textResult = await addTextToPdfPage(page, `Examples:`, { font: boldFont, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                    yPosition = textResult.newYPosition; page = textResult.newPage;

                    // A more robust regex for sentences, handling potential issues with leading/trailing spaces
                    const sentenceRegex = /([^\.!?]+[\.!?]+)\s*|\s*([^\.!?]+)\s*$/g; // Catches full sentences and last potential partial
                    const rawSentences = [...contentItem.DESCRIPTION.matchAll(sentenceRegex)]
                                         .map(match => (match[1] || match[2]).trim())
                                         .filter(s => s.length > 0);
                    const examples = rawSentences.slice(0, 3);
                    
                    functions.logger.debug(`[VOCABULARY] ID: ${contentItem.id || 'N/A'}, DESCRIPTION: "${contentItem.DESCRIPTION}"`);
                    functions.logger.debug(`[VOCABULARY] Extracted Examples:`, examples);

                    if (examples.length > 0) {
                        for (let i = 0; i < examples.length; i++) {
                            // Ensure the example is the actual text, not just its index.
                            textResult = await addTextToPdfPage(page, `  ${i + 1}. ${examples[i]}`, { font: font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                            yPosition = textResult.newYPosition; page = textResult.newPage;
                        }
                    } else {
                        textResult = await addTextToPdfPage(page, `  No examples provided.`, { font: font, size: FONT_SIZE_BODY, color: rgb(0.5, 0.5, 0.5) }, yPosition, fonts, pdfDoc);
                        yPosition = textResult.newYPosition; page = textResult.newPage;
                    }
                }
            } else {
                // For non-vocabulary modules, display Type, Title and then the general TEXT field
                textResult = await addTextToPdfPage(page, `Type: ${contentItem.MODULETYPE || 'N/A'}`, { font: font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                yPosition = textResult.newYPosition; page = textResult.newPage;
                textResult = await addTextToPdfPage(page, `Title: ${contentItem.TITLE || 'Untitled'}`, { font: boldFont, size: FONT_SIZE_BODY + 1 }, yPosition, fonts, pdfDoc);
                yPosition = textResult.newYPosition; page = textResult.newPage;

                textResult = await addTextToPdfPage(page, `Text: ${contentItem.TEXT || 'No text provided.'}`, { font: font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                yPosition = textResult.newYPosition; page = textResult.newPage;
            }
            // --- End Vocabulary Module Specific Content ---

            // Image embedding. Added more logging to trace issues.
            if (contentItem.imageUrl) {
                const imagePathInStorage = contentItem.imageUrl.replace(`https://storage.googleapis.com/${bucket.name}/`, '');
                functions.logger.debug(`[LESSON:${lessonId}] Attempting to embed image for ${contentItem.TITLE || 'Untitled'}. Original URL: ${contentItem.imageUrl}. Derived path: ${imagePathInStorage}`);
            }
            if (contentItem.imageBuffer && contentItem.imageType) {
                functions.logger.debug(`Image buffer and type found for ${contentItem.TITLE || 'Untitled'} (${contentItem.imageType}). Embedding...`);
                const imageResult = await addImageToPdfPage(page, contentItem.imageBuffer, contentItem.imageType, yPosition, pdfDoc);
                yPosition = imageResult.newYPosition; page = imageResult.newPage;
                functions.logger.debug(`Image embedded for ${contentItem.TITLE || 'Untitled'}. New Y position: ${yPosition}`);
            } else if (contentItem.imageUrl) {
                 functions.logger.warn(`Image URL present for ${contentItem.TITLE || 'Untitled'} (${contentItem.imageUrl}), but no imageBuffer/imageType. Check prior download logs for 'Could not fetch image...'.`);
            }

            yPosition -= 15; // Space between content items
        }
    } else {
        textResult = await addTextToPdfPage(page, 'No learning content found for this lesson.', { font: font, size: FONT_SIZE_BODY, color: rgb(0.5, 0.5, 0.5) }, yPosition, fonts, pdfDoc);
        yPosition = textResult.newYPosition; page = textResult.newPage;
    }

    return pdfDoc.save();
}


const generateModulePdf = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540, memory: '512MB' }).https.onCall(async (data, context) => {
    const firestore = admin.firestore();
    const currentUserUid = context.auth?.uid;
    const bucket = admin.storage().bucket();

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

    functions.logger.info(`User ${currentUserUid}: Starting PDF generation for ${moduleType} ID: ${moduleId}`);

    let mainModuleDoc;
    let associatedItems = []; // Will hold learningContent for LESSON, or LESSONs for COURSE
    let finalEstimatedCost = 0;

    try {
        mainModuleDoc = await firestore.collection(moduleType).doc(moduleId).get();
        if (!mainModuleDoc.exists) {
            throw new functions.https.HttpsError('not-found', `${moduleType} not found.`);
        }
        const mainModuleData = mainModuleDoc.data();

        if (moduleType === 'LESSON') {
            const learningContentIds = mainModuleData.MODULEID_ARRAY || [];
            if (learningContentIds.length > 0) {
                const contentPromises = learningContentIds.map(async id => {
                    const doc = await firestore.collection('learningContent').doc(id).get();
                    if (doc.exists) {
                        const contentData = doc.data();
                        if (contentData.imageUrl) {
                            const imagePathInStorage = contentData.imageUrl.replace(`https://storage.googleapis.com/${bucket.name}/`, '');
                            functions.logger.debug(`[LESSON:${moduleId}] Fetching image for contentItem ${id}. Path: ${imagePathInStorage}`);
                            try {
                                const file = bucket.file(imagePathInStorage);
                                const [imageBuffer] = await file.download();
                                contentData.imageBuffer = imageBuffer;
                                if (contentData.imageUrl.endsWith('.png')) contentData.imageType = 'png';
                                else if (contentData.imageUrl.endsWith('.jpg') || contentData.imageUrl.endsWith('.jpeg')) contentData.imageType = 'jpg';
                                else {
                                    functions.logger.warn(`[LESSON:${moduleId}] Unsupported image type for contentItem ${id} from ${contentData.imageUrl}. Image will not be embedded.`);
                                    contentData.imageBuffer = null;
                                }
                            } catch (imgError) {
                                functions.logger.warn(`[LESSON:${moduleId}] Could not fetch image for contentItem ${id} from ${contentData.imageUrl} (path: ${imagePathInStorage}):`, imgError);
                                contentData.imageBuffer = null;
                            }
                        }
                        return contentData;
                    }
                    return null;
                });
                associatedItems = (await Promise.all(contentPromises)).filter(item => item !== null);
            }
            finalEstimatedCost = calculateEstimatedPdfGenerationCost('LESSON', associatedItems.length);

        } else if (moduleType === 'COURSE') {
            const lessonIds = mainModuleData.MODULEID_ARRAY || []; // Assuming COURSE documents have MODULEID_ARRAY of LESSON IDs
            let baseCourseCost = calculateEstimatedPdfGenerationCost('COURSE'); // Cost for course doc update and main course PDF upload

            if (lessonIds.length > 0) {
                const lessonFetchPromises = lessonIds.map(async id => {
                    const lessonDoc = await firestore.collection('LESSON').doc(id).get();
                    if (!lessonDoc.exists) {
                        functions.logger.warn(`[COURSE:${moduleId}] Lesson ${id} referenced by Course ${moduleId} not found.`);
                        return null;
                    }
                    const lessonData = lessonDoc.data();
                    let lessonCost = 0;

                    if (lessonData.pdfUrl) {
                        // If lesson PDF already exists, we incur a read cost to fetch it for merging
                        lessonCost += FIRESTORE_READ_COST_PER_DOC; // for the lesson doc itself
                        // Assuming average lesson PDF size is 0.5MB for costing read
                        lessonCost += CLOUD_STORAGE_READ_COST_PER_MB * 0.5;
                        functions.logger.debug(`[COURSE:${moduleId}] Lesson ${id} has existing PDF, estimated read cost: ${lessonCost.toFixed(6)}`);
                    } else {
                        // If lesson PDF does NOT exist, we incur the full cost of generating it
                        const learningContentIds = lessonData.MODULEID_ARRAY || [];
                        const contentPromises = learningContentIds.map(async contentId => {
                            const doc = await firestore.collection('learningContent').doc(contentId).get();
                            if (doc.exists) {
                                const contentData = doc.data();
                                if (contentData.imageUrl) {
                                    const imagePathInStorage = contentData.imageUrl.replace(`https://storage.googleapis.com/${bucket.name}/`, '');
                                     functions.logger.debug(`[COURSE:${moduleId}] Fetching image for NEW lesson PDF (contentItem ${contentId}). Path: ${imagePathInStorage}`);
                                    try {
                                        const file = bucket.file(imagePathInStorage);
                                        const [imageBuffer] = await file.download();
                                        contentData.imageBuffer = imageBuffer;
                                        if (contentData.imageUrl.endsWith('.png')) contentData.imageType = 'png';
                                        else if (contentData.imageUrl.endsWith('.jpg') || contentData.imageUrl.endsWith('.jpeg')) contentData.imageType = 'jpg';
                                        else {
                                            functions.logger.warn(`[COURSE:${moduleId}] Unsupported image type for new lesson PDF (contentItem ${contentId}) from ${contentData.imageUrl}. Image will not be embedded.`);
                                            contentData.imageBuffer = null;
                                        }
                                    } catch (imgError) {
                                        functions.logger.warn(`[COURSE:${moduleId}] Could not fetch image for new lesson PDF (contentItem ${contentId}) from ${contentData.imageUrl} (path: ${imagePathInStorage}):`, imgError);
                                        contentData.imageBuffer = null;
                                    }
                                }
                                return contentData;
                            }
                            return null;
                        });
                        const learningContents = (await Promise.all(contentPromises)).filter(doc => doc !== null);
                        lessonCost += calculateEstimatedPdfGenerationCost('LESSON', learningContents.length);
                        functions.logger.debug(`[COURSE:${moduleId}] Lesson ${id} needs new PDF generation, estimated cost: ${lessonCost.toFixed(6)}`);

                        // Attach learningContents to lessonData for later PDF generation
                        lessonData.learningContents = learningContents;
                    }
                    lessonData.id = id; // Add ID for easy reference
                    finalEstimatedCost += lessonCost; // Accumulate costs
                    return lessonData;
                });
                associatedItems = (await Promise.all(lessonFetchPromises)).filter(item => item !== null);
            }
            finalEstimatedCost += baseCourseCost; // Add the base cost for the course itself
            functions.logger.debug(`[COURSE:${moduleId}] Final estimated cost for COURSE ${moduleId}: ${finalEstimatedCost.toFixed(6)}`);
        }

    } catch (error) {
        functions.logger.error(`User ${currentUserUid}: Error fetching module or content for PDF generation:`, error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to retrieve module content for PDF generation.', error.message);
    }

    // --- TRANSACTIONAL CREDIT & LIMIT CHECK ---
    // Only perform this check if the user is NOT an admin.
    if (!isAdmin) {
        await firestore.runTransaction(async (transaction) => {
            const userRef = firestore.collection('users').doc(currentUserUid);
            const userDoc = await transaction.get(userRef);

            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'User profile not found. Please log in again.');
            }
            const userProfile = userDoc.data();

            const paymentPlanRef = firestore.collection('paymentPlans').doc(userProfile.planid);
            const paymentPlanDoc = await transaction.get(paymentPlanRef);

            if (!paymentPlanDoc.exists) {
                throw new functions.https.HttpsError('failed-precondition', 'Invalid payment plan assigned to user.');
            }
            const paymentPlan = paymentPlanDoc.data();

            let currentBalance = userProfile.currentBalance || 0;

            if (currentBalance < finalEstimatedCost) {
                throw new functions.https.HttpsError('resource-exhausted', `Insufficient funds. Current balance: ${currentBalance.toFixed(2)}. Estimated cost for this operation: ${finalEstimatedCost.toFixed(2)}.`);
            }

            const operationCountForLimit = 1;
            if (paymentPlan.type !== 'PayAsYouGo' && paymentPlan.moduleCreationLimit !== null) {
                let modulesCreatedThisMonth = userProfile.modulesCreatedThisMonth || 0;
                let lastBillingCycleReset = userProfile.lastBillingCycleReset ? userProfile.lastBillingCycleReset.toDate() : null;
                const now = new Date();

                let shouldReset = false;
                if (!lastBillingCycleReset) {
                    shouldReset = true;
                } else if (paymentPlan.type === 'Monthly' && (now.getMonth() !== lastBillingCycleReset.getMonth() || now.getFullYear() !== lastBillingCycleReset.getFullYear())) {
                    shouldReset = true;
                } else if (paymentPlan.type === 'Yearly' && (now.getFullYear() !== lastBillingCycleReset.getFullYear())) {
                    shouldReset = true;
                }

                if (shouldReset) {
                    modulesCreatedThisMonth = 0;
                    lastBillingCycleReset = admin.firestore.Timestamp.fromDate(now);
                    functions.logger.info(`User ${currentUserUid}: Monthly operation count reset for new billing cycle.`);
                }

                if (modulesCreatedThisMonth + operationCountForLimit > paymentPlan.moduleCreationLimit) {
                    throw new functions.https.HttpsError('resource-exhausted', `Monthly operation limit reached. You have performed ${modulesCreatedThisMonth} out of ${paymentPlan.moduleCreationLimit} operations.`);
                }

                userProfile.modulesCreatedThisMonth = modulesCreatedThisMonth + operationCountForLimit;
                userProfile.lastBillingCycleReset = lastBillingCycleReset;
            }

            // Deduct Funds and Update Counters
            transaction.update(userRef, {
                currentBalance: currentBalance - finalEstimatedCost,
                modulesCreatedThisMonth: userProfile.modulesCreatedThisMonth,
                lastBillingCycleReset: userProfile.lastBillingCycleReset
            });
            functions.logger.info(`User ${currentUserUid}: Deducted ${finalEstimatedCost.toFixed(6)}. New balance: ${(currentBalance - finalEstimatedCost).toFixed(2)}. Operations this month: ${userProfile.modulesCreatedThisMonth}.`);
        });
    } else {
        functions.logger.info(`User ${currentUserUid} is an ADMIN. Bypassing transactional credit/limit check.`);
    }

    let temporarySignedUrl = null; // Will store the final temporary signed URL for the client

    try {
        const mainModuleData = mainModuleDoc.data(); // Re-fetch or reuse data for PDF generation

        if (moduleType === 'LESSON') {
            // --- Generate Single Lesson PDF ---
            const lessonPdfBytes = await _generatePdfContentForLesson(moduleId, mainModuleData, associatedItems); // associatedItems here are learningContents

            const storagePath = `lessons/${moduleId}/${moduleId}-full.pdf`;
            const fileRef = bucket.file(storagePath);
            await fileRef.save(lessonPdfBytes, {
                contentType: 'application/pdf',
                cacheControl: 'public, max-age=31536000',
            });
            await fileRef.makePublic();
            const [tempSignedUrl] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, version: 'v4' });
            temporarySignedUrl = tempSignedUrl;
            const publicUrlForFirestore = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

            // Update the LESSON document with its permanent PDF URL (outside the initial transaction, as transaction is already done)
            await firestore.collection('LESSON').doc(moduleId).update({ pdfUrl: publicUrlForFirestore });
            functions.logger.info(`User ${currentUserUid}: Successfully generated and linked PDF for LESSON ID: ${moduleId}`);

        } else if (moduleType === 'COURSE') {
            // --- Generate Merged Course PDF ---
            const coursePdfDoc = await PDFDocument.create();
            // --- IMPORTANT: Load Unicode-compatible fonts ---
            // You need to place 'NotoSans-Regular.ttf' and 'NotoSans-Bold.ttf'
            // in a 'fonts' directory in your Cloud Function deployment bundle.
            // Download these or similar Unicode-supporting TTF files.
            let font, boldFont;
            try {
                const fontPath = path.join(process.cwd(), 'fonts', 'NotoSans-Regular.ttf');
                const boldFontPath = path.join(process.cwd(), 'fonts', 'NotoSans-Bold.ttf');
                
                functions.logger.debug(`Attempting to load font from: ${fontPath}`);
                const fontBytes = await fs.readFile(fontPath);
                font = await coursePdfDoc.embedFont(fontBytes);

                functions.logger.debug(`Attempting to load bold font from: ${boldFontPath}`);
                const boldFontBytes = await fs.readFile(boldFontPath);
                boldFont = await coursePdfDoc.embedFont(boldFontBytes);
            } catch (fontError) {
                functions.logger.error("Failed to load custom fonts for Course PDF. Falling back to StandardFonts (may not support all characters). Error:", fontError);
                font = await coursePdfDoc.embedFont(StandardFonts.Helvetica);
                boldFont = await coursePdfDoc.embedFont(StandardFonts.HelveticaBold);
            }
            // --- End Font Loading ---

            let currentPage = coursePdfDoc.addPage();
            let currentYPosition = currentPage.getHeight() - MARGIN;
            const fonts = { font, boldFont };

            // Course Header (no "COURSE PDF:" text)
            let textResult = await addTextToPdfPage(currentPage, `${mainModuleData.TITLE || 'Untitled'}`, { font: boldFont, size: HEADER_FONT_SIZE, color: rgb(0.05, 0.25, 0.45) }, currentYPosition, fonts, coursePdfDoc);
            currentYPosition = textResult.newYPosition; currentPage = textResult.newPage;
            textResult = await addTextToPdfPage(currentPage, `ID: ${moduleId}`, { font: font, size: FONT_SIZE_SMALL }, currentYPosition, fonts, coursePdfDoc);
            currentYPosition = textResult.newYPosition; currentPage = textResult.newPage;
            textResult = await addTextToPdfPage(currentPage, `Description: ${mainModuleData.DESCRIPTION || 'N/A'}`, { font: font, size: SUBHEADER_FONT_SIZE }, currentYPosition, fonts, coursePdfDoc);
            currentYPosition = textResult.newYPosition; currentPage = textResult.newPage;

            currentYPosition -= 20;

            if (associatedItems.length > 0) {
                textResult = await addTextToPdfPage(currentPage, 'Lessons in this Course:', { font: boldFont, size: SUBHEADER_FONT_SIZE, color: rgb(0.1, 0.4, 0.6) }, currentYPosition, fonts, coursePdfDoc);
                currentYPosition = textResult.newYPosition; currentPage = textResult.newPage;
                currentYPosition -= 10;

                for (const lesson of associatedItems) {
                    textResult = await addTextToPdfPage(currentPage, `Lesson: ${lesson.TITLE || 'Untitled'}`, { font: boldFont, size: FONT_SIZE_BODY + 1 }, currentYPosition, fonts, coursePdfDoc);
                    currentYPosition = textResult.newYPosition; currentPage = textResult.newPage;
                    // Do NOT include Theme here
                    textResult = await addTextToPdfPage(currentPage, `Lesson ID: ${lesson.id}`, { font: font, size: FONT_SIZE_BODY }, currentYPosition, fonts, coursePdfDoc);
                    currentYPosition = textResult.newYPosition; currentPage = textResult.newPage;
                    currentYPosition -= 15; // Space between lessons
                }
            } else {
                textResult = await addTextToPdfPage(currentPage, 'No lessons found for this course.', { font: font, size: FONT_SIZE_BODY, color: rgb(0.5, 0.5, 0.5) }, currentYPosition, fonts, coursePdfDoc);
                currentYPosition = textResult.newYPosition; currentPage = textResult.newPage;
            }

            // After listing lessons, start merging the actual lesson PDFs on subsequent pages
            for (const lesson of associatedItems) {
                let lessonPdfBytes;
                let lessonPublicUrl = lesson.pdfUrl; // Default to existing URL

                // New page break between listed lessons and merged content
                currentPage = coursePdfDoc.addPage();
                currentYPosition = currentPage.getHeight() - MARGIN; // Reset Y for new page

                // Add a small header for the lesson being merged
                textResult = await addTextToPdfPage(currentPage, `--- Merged Lesson: ${lesson.TITLE || 'Untitled'} ---`, { font: boldFont, size: SUBHEADER_FONT_SIZE, color: rgb(0.4, 0.2, 0.6) }, currentYPosition, fonts, coursePdfDoc);
                currentYPosition = textResult.newYPosition; currentPage = textResult.newPage;
                currentYPosition -= 10;

                if (lesson.pdfUrl) {
                    functions.logger.debug(`[COURSE:${moduleId}] Fetching existing PDF for Lesson ${lesson.id} from ${lesson.pdfUrl}`);
                    // Fetch existing lesson PDF
                    const imagePathInStorage = lesson.pdfUrl.replace(`https://storage.googleapis.com/${bucket.name}/`, '');
                    const file = bucket.file(imagePathInStorage);
                    [lessonPdfBytes] = await file.download();
                    functions.logger.debug(`[COURSE:${moduleId}] Downloaded existing PDF for Lesson ${lesson.id}`);
                } else {
                    functions.logger.debug(`[COURSE:${moduleId}] Generating new PDF for Lesson ${lesson.id}`);
                    // Generate new lesson PDF
                    lessonPdfBytes = await _generatePdfContentForLesson(lesson.id, lesson, lesson.learningContents);
                    functions.logger.debug(`[COURSE:${moduleId}] Generated new PDF for Lesson ${lesson.id}`);

                    // Upload this newly generated lesson PDF
                    const lessonStoragePath = `lessons/${lesson.id}/${lesson.id}-full.pdf`;
                    const lessonFileRef = bucket.file(lessonStoragePath);
                    await lessonFileRef.save(lessonPdfBytes, {
                        contentType: 'application/pdf',
                        cacheControl: 'public, max-age=31536000',
                    });
                    await lessonFileRef.makePublic();
                    lessonPublicUrl = `https://storage.googleapis.com/${bucket.name}/${lessonStoragePath}`;
                    functions.logger.debug(`[COURSE:${moduleId}] Uploaded new PDF for Lesson ${lesson.id} to ${lessonPublicUrl}`);
                }

                // Load and copy pages from the lesson PDF into the course PDF
                const embeddedLessonPdf = await PDFDocument.load(lessonPdfBytes);
                const copiedPages = await coursePdfDoc.copyPages(embeddedLessonPdf, embeddedLessonPdf.getPageIndices());
                copiedPages.forEach((cp) => coursePdfDoc.addPage(cp));

                // If this lesson's PDF was newly generated, update its Firestore document
                if (!lesson.pdfUrl) { // Only update if it didn't have one before
                    await firestore.collection('LESSON').doc(lesson.id).update({ pdfUrl: lessonPublicUrl });
                    functions.logger.info(`[COURSE:${moduleId}] Updated pdfUrl for newly generated LESSON ID: ${lesson.id}`);
                }
            }

            const coursePdfBytes = await coursePdfDoc.save();

            // Upload the merged Course PDF
            const storagePath = `courses/${moduleId}/${moduleId}-full.pdf`;
            const fileRef = bucket.file(storagePath);
            await fileRef.save(coursePdfBytes, {
                contentType: 'application/pdf',
                cacheControl: 'public, max-age=31536000',
            });
            await fileRef.makePublic();
            const [tempSignedUrl] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, version: 'v4' });
            temporarySignedUrl = tempSignedUrl;
            const publicUrlForFirestore = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

            // Update the COURSE document with its permanent PDF URL
            await firestore.collection('COURSE').doc(moduleId).update({ pdfUrl: publicUrlForFirestore });
            functions.logger.info(`User ${currentUserUid}: Successfully generated and linked PDF for COURSE ID: ${moduleId}`);
        }

    } catch (error) {
        functions.logger.error(`User ${currentUserUid}: Error generating or uploading PDF for ${moduleType} ${moduleId}:`, error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', `An unexpected error occurred during PDF generation for ${moduleType}.`, error.message);
    }

    return { success: true, downloadUrl: temporarySignedUrl };
});

module.exports = { generateModulePdf };
