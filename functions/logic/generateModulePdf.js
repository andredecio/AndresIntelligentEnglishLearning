//generateModulePdf version v1.008a 19/10/2025

import { createRequire } from 'module'; 
import * as functions from "firebase-functions/v1";
import { regionalFunctions } from "../config.js";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';              // 1. Ensure path is imported
import { fileURLToPath } from 'url';  // 2. Add URL helper for ESM

// 3. Robust ESM directory resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 4. Safely resolve path to the fonts directory (up one level from logic/)
const fontPath = path.join(__dirname, '..', 'fonts', 'Roboto-Regular.ttf');
const fontBytes = await fs.promises.readFile(fontPath);

const require = createRequire(import.meta.url);

if (getApps().length === 0) {
    initializeApp();
}

// GLOBAL DEBUGGING LINES - PLACED AT THE TOP OF THE FILE
try {
// 3. This require statement will now work flawlessly!
const pdfLibPackage = require('pdf-lib/package.json');
functions.logger.info('[GLOBAL DEBUG] Deployed pdf-lib version: ${pdfLibPackage.version}');
} catch (e) {
functions.logger.error('[GLOBAL DEBUG] Could not get pdf-lib version: ${e.message}');
}
// END GLOBAL DEBUGGING LINES

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

async function embedBuffer(pdfDoc, imageBuffer) {
  if (!imageBuffer) return null;
  // Bypasses the Node.js buffer pool offset bug
  const cleanBytes = new Uint8Array(imageBuffer);
  // Detect PNG signature (89 50 4E 47)
  const isPng = cleanBytes[0] === 0x89 && cleanBytes[1] === 0x50 && cleanBytes[2] === 0x4E && cleanBytes[3] === 0x47;
  return isPng ? await pdfDoc.embedPng(cleanBytes) : await pdfDoc.embedJpg(cleanBytes);
}


// --- Helper Function for Cost Estimation for PDF Generation ---
/**

Estimates the total cost in the base currency for generating a PDF for a module (Lesson or Course).

This includes Cloud Function execution, Firestore reads for content, and Cloud Storage write for the PDF.

@param {string} moduleType - 'LESSON' or 'COURSE'

@param {number} contentItemCount - Number of associated learningContent items or lessons.

@returns {number} Estimated cost in base currency.
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

functions.logger.debug('Estimated cost for generating PDF for ${moduleType} with ${contentItemCount} items: ${totalEstimatedCost.toFixed(6)}');

return totalEstimatedCost;
}

// --- Internal PDF Generation Helpers ---

/**

Helper to add text to a PDF page, handling new pages and manual word wrapping.

@param {PDFPage} page The current PDF page.

@param {string} text The text to add.

@param {object} options PDF drawing options.

@param {number} currentYPosition The current Y position (top of the text block).

@param {object} fonts Object containing font references.

@param {PDFDocument} pdfDoc The PDFDocument instance.

@returns {{newYPosition: number, newPage: PDFPage}} The updated Y position and page.
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
         // Fallback: replace unsupported chars with a placeholder like '?'
         linesToDraw.push(testLine.replace(/[^ -~\n\r\t]/g, '?')); // Replace non-ASCII with '?'
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

Helper to estimate text height without drawing it.

@param {string} text The text to estimate height for.

@param {object} fonts Object containing font references.

@param {number} size Font size.

@param {number} maxWidth Maximum width for text.

@param {number} lineHeight Line height.

@returns {number} Estimated height.
*/
function estimateTextHeight(text, fonts, size, maxWidth, lineHeight) {
if (!text || !text.trim()) return 0;
const paragraphs = text.split('\n');
let estimatedHeight = 0;
for (const paragraph of paragraphs) {
if (!paragraph.trim()) {
estimatedHeight += lineHeight / 2; // Blank line space
continue;
}
const words = paragraph.split(' ');
let currentLine = '';
let lineCount = 0;
for (const word of words) {
const testLine = currentLine === '' ? word : '${currentLine} ${word}';
try {
const testLineWidth = fonts.font.widthOfTextAtSize(testLine, size);
if (testLineWidth <= maxWidth) {
currentLine = testLine;
} else {
lineCount++;
currentLine = word;
}
} catch (e) {
// Fallback for encoding errors - assume it takes at least one line
lineCount++;
currentLine = '';
}
}
if (currentLine !== '') {
lineCount++;
}
estimatedHeight += (lineCount * lineHeight) + 5; // +5 for paragraph padding
}
return estimatedHeight;
}

/**

Helper to add image to a PDF page, scaling it to fit within specified dimensions.

This version assumes the page break logic has already ensured enough space.

@param {PDFPage} page The current PDF page.

@param {Buffer} imageBuffer The image buffer.

@param {string} imageType 'png' or 'jpg'.

@param {number} currentYPosition The current Y position.

@param {PDFDocument} pdfDoc The PDFDocument instance.

@param {number} maxWidth Maximum width for the image.

@param {number} maxHeight Maximum height for the image.

@returns {{newYPosition: number, newPage: PDFPage}} The updated Y position and page.
*/
async function addImageToPdfPage(page, imageBuffer, imageType, currentYPosition, pdfDoc, maxWidth, maxHeight) {
  if (!imageBuffer) return { newYPosition: currentYPosition, newPage: page };

  let embeddedImage;
  try {
    embeddedImage = await embedBuffer(pdfDoc, imageBuffer);
  } catch (err) {
    functions.logger.warn(`Could not embed image: ${err.message}`);
    return { newYPosition: currentYPosition, newPage: page };
  }

  if (!embeddedImage) return { newYPosition: currentYPosition, newPage: page };

  const imageDims = embeddedImage.scaleToFit(maxWidth, maxHeight);
  page.drawImage(embeddedImage, {
    x: MARGIN,
    y: currentYPosition - imageDims.height,
    width: imageDims.width,
    height: imageDims.height,
  });
  currentYPosition -= imageDims.height + 15;

  return { newYPosition: currentYPosition, newPage: page };
}



// --- New Helper Function for Page Numbering ---
/**

Adds page numbers to a PDFDocument, starting from the second page.

@param {PDFDocument} pdfDoc The PDFDocument instance to add page numbers to.

@param {PDFFont} font The font to use for page numbers.
*/
async function addPageNumbersToPdf(pdfDoc) {
const pages = pdfDoc.getPages();
const totalPages = pages.length;
 // Embed the standard Helvetica font directly into the active document
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const PAGE_NUMBER_FONT_SIZE = 9; // FONT_SIZE_SMALL equivalent
	
for (let i = 0; i < totalPages; i++) {
// Skip numbering for the very first page of the entire document
if (i === 0) continue;

 const page = pages[i];
 const pageNumberText = `Page ${i + 1} of ${totalPages}`;
 
 // Calculate text width to right-align it
 const textWidth = font.widthOfTextAtSize(pageNumberText, PAGE_NUMBER_FONT_SIZE);
 const x = page.getWidth() - MARGIN - textWidth; // Right align from right margin
 const y = page.getHeight() - MARGIN / 2; // Position slightly below the top margin

 page.drawText(pageNumberText, {
     x,
     y,
     font,
     size: PAGE_NUMBER_FONT_SIZE,
     color: rgb(0.5, 0.5, 0.5), // Light gray for page numbers for subtlety
 });
}
}

/**

Generates the PDF content for a single lesson.

This helper does NOT handle uploads or Firestore updates directly, just returns PDF bytes and image fetches.

@param {string} lessonId The ID of the lesson.

@param {object} lessonData The lesson document data.

@param {Array<object>} learningContents An array of learningContent data objects, potentially with imageBuffer and imageType.

@param {object} bucket The Firebase Storage bucket object.

@returns {Promise<Buffer>} The PDF bytes for the lesson.
*/
async function _generatePdfContentForLesson(lessonId, lessonData, learningContents, bucket) {
const pdfDoc = await PDFDocument.create();
pdfDoc.registerFontkit(fontkit); // 1. REGISTER FONTKIT HERE

// --- IMPORTANT: Load Unicode-compatible fonts ---
let font, boldFont;
try {
    // 2. EMBED THE CUSTOM FONT
    font = await pdfDoc.embedFont(fontBytes); 
    boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold); // Fallback bold or use custom bold
    functions.logger.info("Using custom Roboto font for lesson PDF.");
} catch (fontError) {
    functions.logger.error("Error loading custom font. Falling back to Helvetica:", fontError);
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
}

let page = pdfDoc.addPage();
let yPosition = page.getHeight() - MARGIN;
const pageWidth = page.getWidth();
const pageHeight = page.getHeight();
const contentWidth = pageWidth - 2 * MARGIN;

const fonts = { font, boldFont };

// Lesson Header
let textResult = await addTextToPdfPage(page, `${lessonData.TITLE || 'Untitled'}`, { font: boldFont, size: HEADER_FONT_SIZE, color: rgb(0.05, 0.25, 0.45) }, yPosition, fonts, pdfDoc);
yPosition = textResult.newYPosition; page = textResult.newPage;
textResult = await addTextToPdfPage(page, `ID: ${lessonId}`, { font: font, size: FONT_SIZE_SMALL }, yPosition, fonts, pdfDoc);
yPosition = textResult.newYPosition; page = textResult.newPage;
textResult = await addTextToPdfPage(page, `Theme: ${lessonData.THEME || 'N/A'}`, { font: font, size: SUBHEADER_FONT_SIZE }, yPosition, fonts, pdfDoc);
yPosition = textResult.newYPosition; page = textResult.newPage;
textResult = await addTextToPdfPage(page, `CEFR Level: ${lessonData.CEFR_LEVEL || 'N/A'}`, { font: font, size: SUBHEADER_FONT_SIZE }, yPosition, fonts, pdfDoc);
yPosition = textResult.newYPosition; page = textResult.newPage;

yPosition -= 20;

if (learningContents.length > 0) {
for (const [index, contentItem] of learningContents.entries()) {
let currentModuleTextForEstimation = '';

     // Build up the text content for estimation
     currentModuleTextForEstimation += `Type: ${contentItem.MODULETYPE || 'N/A'}\n`;
     currentModuleTextForEstimation += `Title: ${contentItem.TITLE || 'Untitled'}\n`;

     if (contentItem.MODULETYPE === 'VOCABULARY_GROUP') {
         const meaningOriginContent = contentItem.MEANING_ORIGIN || 'No meaning/origin provided for group.';
         currentModuleTextForEstimation += `Meaning/Origin: ${meaningOriginContent}\n`;
     } else if (contentItem.MODULETYPE === 'VOCABULARY') {
         if (contentItem.WORD_TYPE) {
             currentModuleTextForEstimation += `Word Type: ${contentItem.WORD_TYPE}\n`;
             if (contentItem.WORD_TYPE.toLowerCase() === 'verb') {
                 if (contentItem.PRESENT_SIMPLE_3RD_PERSON_SINGULAR) currentModuleTextForEstimation += `  Present Simple 3rd Person: ${contentItem.PRESENT_SIMPLE_3RD_PERSON_SINGULAR}\n`;
                 if (contentItem.SIMPLE_PAST) currentModuleTextForEstimation += `  Past Simple: ${contentItem.SIMPLE_PAST}\n`;
                 if (contentItem.PAST_PARTICIPLE) currentModuleTextForEstimation += `  Past Participle: ${contentItem.PAST_PARTICIPLE}\n`;
             }
         }
         if (contentItem.DESCRIPTION) {
             currentModuleTextForEstimation += `Examples:\n`;
             let description = contentItem.DESCRIPTION || 'No examples provided.';
             description = description.replace(/([^\n])(\d+\.\s)/g, '$1\n$2');
             if (description.startsWith('\n')) {
                 description = description.substring(1);
             }
             currentModuleTextForEstimation += description + '\n';
         }
     } else { // All other module types
         currentModuleTextForEstimation += `Description: `;
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
         currentModuleTextForEstimation += description + '\n';
     }

     const estimatedTextHeight = estimateTextHeight(currentModuleTextForEstimation, fonts, FONT_SIZE_BODY, contentWidth, LINE_HEIGHT_BODY);
     
     let estimatedImageHeightForPageBreak = 0;
     if (contentItem.imageBuffer) {
         let tempEmbeddedImage;
         try {
             tempEmbeddedImage = await embedBuffer(pdfDoc, contentItem.imageBuffer);
         } catch (e) {
             functions.logger.error("Error embedding image for height estimation:", e);
         }
         
         if (tempEmbeddedImage) {
             const maxImageHeightConstraint = (yPosition - estimatedTextHeight) - MARGIN - 15;
             const effectiveMaxImageHeight = Math.max(0, maxImageHeightConstraint);
             const imageDims = tempEmbeddedImage.scaleToFit(contentWidth, effectiveMaxImageHeight);
             estimatedImageHeightForPageBreak = imageDims.height > 0 ? (imageDims.height + 15) : 0;
         }
     }

     const spaceNeededForDemarcation = (index < learningContents.length - 1) ? 30 : 15; // line + space or just space after last item
     const spaceBetweenModules = (index > 0) ? 20 : 0; // Space before this module if it's not the first on the page

     const totalRequiredHeightForModule = estimatedTextHeight + estimatedImageHeightForPageBreak + spaceNeededForDemarcation + spaceBetweenModules;

     // If the entire module (text + aggressively scaled image) won't fit, start a new page
     if (yPosition - totalRequiredHeightForModule < MARGIN) {
         page = pdfDoc.addPage();
         yPosition = pageHeight - MARGIN; // Reset Y for new page
         functions.logger.debug(`[PDF_GEN_DEBUG] New page added for content item ${index}: ${contentItem.TITLE || 'Untitled'}`);
         // If a new page is added, the 'spaceBetweenModules' is implicit by starting at top.
         // We might still want some top padding, but for now we reset.
     } else if (index > 0) {
         // If it fits and it's not the first item, add some space from the previous one.
         yPosition -= 20;
     }

     // --- Now draw the content ---
     let drawTextResult = await addTextToPdfPage(page, `Type: ${contentItem.MODULETYPE || 'N/A'}`, { font: fonts.font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
     yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;
     drawTextResult = await addTextToPdfPage(page, `Title: ${contentItem.TITLE || 'Untitled'}`, { font: fonts.boldFont, size: FONT_SIZE_BODY + 1 }, yPosition, fonts, pdfDoc);
     yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;

     // Retrieve the potentially processed description for drawing
     let descriptionToDraw = '';
     if (contentItem.MODULETYPE === 'VOCABULARY_GROUP') {
         descriptionToDraw = contentItem.MEANING_ORIGIN || 'No meaning/origin provided for group.';
         drawTextResult = await addTextToPdfPage(page, `Meaning/Origin: ${descriptionToDraw}`, { font: fonts.font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
         yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;

     } else if (contentItem.MODULETYPE === 'VOCABULARY') {
         // Include MEANING_ORIGIN for individual vocabulary words if present
         if (contentItem.MEANING_ORIGIN) {
             drawTextResult = await addTextToPdfPage(page, `Meaning/Origin: ${contentItem.MEANING_ORIGIN}`, { font: fonts.font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
             yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;
         }

         // Always include Word Type for vocabulary
         if (contentItem.WORD_TYPE) {
             drawTextResult = await addTextToPdfPage(page, `Word Type: ${contentItem.WORD_TYPE}`, { font: fonts.font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
             yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;

             if (contentItem.WORD_TYPE.toLowerCase() === 'verb') {
                 if (contentItem.PRESENT_SIMPLE_3RD_PERSON_SINGULAR) {
                     drawTextResult = await addTextToPdfPage(page, `  Present Simple 3rd Person Singular: ${contentItem.PRESENT_SIMPLE_3RD_PERSON_SINGULAR}`, { font: fonts.font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                     yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;
                 }
                 if (contentItem.SIMPLE_PAST) {
                     drawTextResult = await addTextToPdfPage(page, `  Simple Past: ${contentItem.SIMPLE_PAST}`, { font: fonts.font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                     yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;
                 }
                 if (contentItem.PAST_PARTICIPLE) {
                     drawTextResult = await addTextToPdfPage(page, `  Past Participle: ${contentItem.PAST_PARTICIPLE}`, { font: fonts.font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
                     yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;
                 }
             }
         }

         if (contentItem.DESCRIPTION) {
             drawTextResult = await addTextToPdfPage(page, `Examples:`, { font: fonts.boldFont, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
             yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;
             // Re-process description for actual drawing using the already prepared one for estimation
             descriptionToDraw = contentItem.DESCRIPTION || 'No examples provided.';
             descriptionToDraw = descriptionToDraw.replace(/([^\n])(\d+\.\s)/g, '$1\n$2');
             if (descriptionToDraw.startsWith('\n')) {
                 descriptionToDraw = descriptionToDraw.substring(1);
             }
             drawTextResult = await addTextToPdfPage(page, descriptionToDraw, { font: fonts.font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
             yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;
         }

     } // End VOCABULARY block
        else { // All other module types
         // Re-process description for actual drawing using the already prepared one for estimation
         descriptionToDraw = contentItem.DESCRIPTION || 'No description provided.';
         if (contentItem.MODULETYPE === 'LISTENINGSPEAKING') {
             descriptionToDraw = descriptionToDraw
                 .replace(/<speak>/g, '')
                 .replace(/<\/speak>/g, '')
                 .replace(/<break time='[^']+'\/>/g, '')
                 .replace(/<prosody[^>]*>/g, '')
                 .replace(/<\/prosody>/g, '')
                 .replace(/\s+/g, ' ')
                 .trim();
         }
         if (contentItem.MODULETYPE === 'CONVERSATION') {
             descriptionToDraw = descriptionToDraw.replace(/(\n|^)(Person [A-Z]:|Person [A-Z]:)/g, '\n$2');
             if (descriptionToDraw.startsWith('\n')) {
                 descriptionToDraw = descriptionToDraw.substring(1);
             }
         }
         descriptionToDraw = descriptionToDraw.replace(/([^\n])(\d+\.\s)/g, '$1\n$2');
         drawTextResult = await addTextToPdfPage(page, `Description: ${descriptionToDraw}`, { font: fonts.font, size: FONT_SIZE_BODY }, yPosition, fonts, pdfDoc);
         yPosition = drawTextResult.newYPosition; page = drawTextResult.newPage;
     }

     // Image embedding. The max height for image is now currentYPosition - MARGIN.
     if (contentItem.imageBuffer && contentItem.imageType) {
         functions.logger.debug(`Image buffer and type found for ${contentItem.TITLE || 'Untitled'} (${contentItem.imageType}). Embedding...`);
         // Pass the remaining vertical space as maxHeight to addImageToPdfPage
         // yPosition here is the current Y after text has been drawn.
         const maxImageHeightForDrawing = yPosition - MARGIN;
         const imageResult = await addImageToPdfPage(page, contentItem.imageBuffer, contentItem.imageType, yPosition, pdfDoc, contentWidth, maxImageHeightForDrawing);
         yPosition = imageResult.newYPosition; page = imageResult.newPage;
         functions.logger.debug(`Image embedded for ${contentItem.TITLE || 'Untitled'}. New Y position: ${yPosition}`);
     } else if (contentItem.IMAGEURL) {
          functions.logger.warn(`Image URL present for ${contentItem.TITLE || 'Untitled'} (${contentItem.IMAGEURL}), but image download failed or type is unsupported for embedding. Check GCS permissions, file existence, and download errors above.`);
     } else {
         functions.logger.debug(`No IMAGEURL found for contentItem ${contentItem.TITLE || 'Untitled'}. Skipping image embedding.`);
     }

     // Demarcation after each learningContent item, except the very last one
     if (index < learningContents.length - 1) {
         yPosition -= 10; // Space before line
         page.drawLine({
             start: { x: MARGIN, y: yPosition },
             end: { x: pageWidth - MARGIN, y: yPosition },
             thickness: 0.5,
             color: rgb(0.7, 0.7, 0.7), // Light gray
         });
         yPosition -= 10; // Space after line
     }
 }
} else {
textResult = await addTextToPdfPage(page, 'No learning content found for this lesson.', { font: font, size: FONT_SIZE_BODY, color: rgb(0.5, 0.5, 0.5) }, yPosition, fonts, pdfDoc);
yPosition = textResult.newYPosition; page = textResult.newPage;
}

return pdfDoc;
}

export const generateModulePdf = regionalFunctions
  .runWith({ timeoutSeconds: 540, memory: '1GB' }) // Upgrades memory and timeout for this specific function!
  .https.onCall(async (data, context) => {
    const firestore = getFirestore();
    const currentUserUid = context.auth?.uid;
    const bucket = getStorage().bucket();


// --- Font embedding for page numbering and general use within this function ---
const tempPdfDocForFontEmbedding = await PDFDocument.create(); // Temporary doc to embed fonts once
let font, boldFont;
try {
    font = await tempPdfDocForFontEmbedding.embedFont(StandardFonts.Helvetica);
    boldFont = await tempPdfDocForFontEmbedding.embedFont(StandardFonts.HelveticaBold);
    functions.logger.info("Using StandardFonts (Helvetica) for PDF generation.");
} catch (fontError) {
    functions.logger.error("Unexpected error loading StandardFonts. Error:", fontError);
    // Fallback to ensure fonts are still assigned even if there's an error
    font = await PDFDocument.create().then(doc => doc.embedFont(StandardFonts.Helvetica));
    boldFont = await PDFDocument.create().then(doc => doc.embedFont(StandardFonts.HelveticaBold));
}
// Now 'font' and 'boldFont' are available for all PDF operations within generateModulePdf

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
    throw new new functions.https.HttpsError(
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
        functions.logger.debug(`[PDF_GEN_DEBUG] Lesson ${moduleId}: MODULEID_ARRAY = ${JSON.stringify(learningContentIds)}`);

        if (learningContentIds.length > 0) {
            const contentPromises = learningContentIds.map(async id => {
                const doc = await firestore.collection('learningContent').doc(id).get();
                if (doc.exists) {
                    const contentData = doc.data();
                    if (contentData.IMAGEURL) {
                        functions.logger.debug(`[LESSON:${moduleId}] Fetching image for contentItem ${id}. Original URL: ${contentData.IMAGEURL}`);
                        try {
                            const baseUrl = `https://storage.googleapis.com/${bucket.name}/`;
                            let imagePathInStorage = contentData.IMAGEURL.replace(baseUrl, '');
                            imagePathInStorage = decodeURIComponent(imagePathInStorage);

                            const file = bucket.file(imagePathInStorage);
                            const [imageBuffer] = await file.download();
                            contentData.imageBuffer = imageBuffer;
                            if (contentData.IMAGEURL.endsWith('.png')) contentData.imageType = 'png';
                            else if (contentData.IMAGEURL.endsWith('.jpg') || contentData.IMAGEURL.endsWith('.jpeg')) contentData.imageType = 'jpg';
                            else {
                                functions.logger.warn(`[LESSON:${moduleId}] Unsupported image type for contentItem ${id} from ${contentData.IMAGEURL}. Image will not be embedded.`);
                                contentData.imageBuffer = null;
                            }
                        } catch (imgError) {
                            functions.logger.warn(`[LESSON:${moduleId}] Could not fetch image for contentItem ${id} from ${contentData.IMAGEURL}:`, imgError);
                            contentData.imageBuffer = null;
                        }
                    }
                    return contentData;
                }
                functions.logger.warn(`[PDF_GEN_DEBUG] LearningContent document with ID ${id} not found for Lesson ${moduleId}.`);
                return null;
            });
            associatedItems = (await Promise.all(contentPromises)).filter(item => item !== null);
        }
        functions.logger.debug(`[PDF_GEN_DEBUG] Lesson ${moduleId}: Final associatedItems.length = ${associatedItems.length}`);
        finalEstimatedCost = calculateEstimatedPdfGenerationCost('LESSON', associatedItems.length);
    }         // --- REMOVED THE DUPLICATE PDF GENERATION & UPLOAD HERE ---
else if (moduleType === 'COURSE') {
const lessonIds = mainModuleData.MODULEID_ARRAY || [];
functions.logger.debug('[PDF_GEN_DEBUG] Course ${moduleId}: MODULEID_ARRAY (lesson IDs) = ${JSON.stringify(lessonIds)}');
let baseCourseCost = calculateEstimatedPdfGenerationCost('COURSE');

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
                    lessonCost += FIRESTORE_READ_COST_PER_DOC;
                    lessonCost += CLOUD_STORAGE_READ_COST_PER_MB * 0.5;
                    functions.logger.debug(`[COURSE:${moduleId}] Lesson ${id} has existing PDF, estimated read cost: ${lessonCost.toFixed(6)}`);
                } else {
                    const learningContentIds = lessonData.MODULEID_ARRAY || [];
                    functions.logger.debug(`[PDF_GEN_DEBUG] Course ${moduleId}, Lesson ${id}: MODULEID_ARRAY (learningContent IDs) = ${JSON.stringify(learningContentIds)}`);

                    const contentPromises = learningContentIds.map(async contentId => {
                        const doc = await firestore.collection('learningContent').doc(contentId).get();
                        if (doc.exists) {
                            const contentData = doc.data();
                            if (contentData.IMAGEURL) {
                                 functions.logger.debug(`[COURSE:${moduleId}] Fetching image for NEW lesson PDF (contentItem ${contentId}). Original URL: ${contentData.IMAGEURL}`);
                                try {
                                    const baseUrl = `https://storage.googleapis.com/${bucket.name}/`;
                                    let imagePathInStorage = contentData.IMAGEURL.replace(baseUrl, '');
                                    imagePathInStorage = decodeURIComponent(imagePathInStorage);

                                    const file = bucket.file(imagePathInStorage);
                                    const [imageBuffer] = await file.download();
                                    contentData.imageBuffer = imageBuffer;
                                    if (contentData.IMAGEURL.endsWith('.png')) contentData.imageType = 'png';
                                    else if (contentData.IMAGEURL.endsWith('.jpg') || contentData.IMAGEURL.endsWith('.jpeg')) contentData.imageType = 'jpg';
                                    else {
                                        functions.logger.warn(`[COURSE:${moduleId}] Unsupported image type for new lesson PDF (contentItem ${contentId}) from ${contentData.IMAGEURL}. Image will not be embedded.`);
                                        contentData.imageBuffer = null;
                                    }
                                } catch (imgError) {
                                    functions.logger.warn(`[COURSE:${moduleId}] Could not fetch image for new lesson PDF (contentItem ${contentId}) from ${contentData.IMAGEURL}:`, imgError);
                                    contentData.imageBuffer = null;
                                }
                            }
                            return contentData;
                        }
                        functions.logger.warn(`[PDF_GEN_DEBUG] LearningContent document with ID ${contentId} not found for Course ${moduleId}, Lesson ${id}.`);
                        return null;
                    });
                    const learningContents = (await Promise.all(contentPromises)).filter(doc => doc !== null);
                    functions.logger.debug(`[PDF_GEN_DEBUG] Course ${moduleId}, Lesson ${id}: Final learningContents.length = ${learningContents.length}`);
                    lessonCost += calculateEstimatedPdfGenerationCost('LESSON', learningContents.length);
                    functions.logger.debug(`[COURSE:${moduleId}] Lesson ${id} needs new PDF generation, estimated cost: ${lessonCost.toFixed(6)}`);

                    lessonData.learningContents = learningContents;
                }
                lessonData.id = id;
                finalEstimatedCost += lessonCost;
                return lessonData;
            });
            associatedItems = (await Promise.all(lessonFetchPromises)).filter(item => item !== null);
        }
        finalEstimatedCost += baseCourseCost;
        functions.logger.debug(`[COURSE:${moduleId}] Final estimated cost for COURSE ${moduleId}: ${finalEstimatedCost.toFixed(6)}`);
    }

} catch (error) {
    functions.logger.error(`User ${currentUserUid}: Error estimating PDF for ${moduleType} ${moduleId}:`, error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', 'Failed to retrieve module content.', error.message);
}
// --- TRANSACTIONAL CREDIT & LIMIT CHECK ---
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
    lastBillingCycleReset = Timestamp.fromDate(now); // Replaced admin.firestore.Timestamp
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

var temporarySignedUrl = null;

try {
    const mainModuleData = mainModuleDoc.data();

    if (moduleType === 'LESSON') {
        // FIX: Generate the document, add page numbers, and serialize to bytes
        const lessonPdfDoc = await _generatePdfContentForLesson(moduleId, mainModuleData, associatedItems, bucket);
        await addPageNumbersToPdf(lessonPdfDoc, font);
        const lessonPdfBytes = await lessonPdfDoc.save(); 
        
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

        await firestore.collection('LESSON').doc(moduleId).update({ pdfUrl: publicUrlForFirestore });
        functions.logger.info(`User ${currentUserUid}: Successfully generated and linked PDF for LESSON ID: ${moduleId}`);

    } else if (moduleType === 'COURSE') {
        const coursePdfDoc = await PDFDocument.create();
        coursePdfDoc.registerFontkit(fontkit); // 1. REGISTER FONTKIT ON THE COURSE DOC

        // 2. EMBED THE FONTS SPECIFICALLY FOR THIS DOC
        const font = await coursePdfDoc.embedFont(fontBytes);
        const boldFont = await coursePdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fonts = { font, boldFont }; 

        let currentPage = coursePdfDoc.addPage(); 
        let currentYPosition = currentPage.getHeight() - MARGIN;


        // Course Header
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
                textResult = await addTextToPdfPage(currentPage, `Lesson ID: ${lesson.id}`, { font: font, size: FONT_SIZE_BODY }, currentYPosition, fonts, coursePdfDoc);
                currentYPosition = textResult.newYPosition; currentPage = textResult.newPage;
                currentYPosition -= 15; // Space between lessons
            }
        } else {
            textResult = await addTextToPdfPage(currentPage, 'No lessons found for this course.', { font: font, size: FONT_SIZE_BODY, color: rgb(0.5, 0.5, 0.5) }, currentYPosition, fonts, coursePdfDoc);
            currentYPosition = textResult.newYPosition; currentPage = textResult.newPage;
        }

        // After listing lessons, start merging the actual lesson PDFs on subsequent pages
// Step 1: Download or generate all lesson PDFs in parallel
const lessonDocPromises = associatedItems.map(async (lesson) => {
    if (lesson.pdfUrl) {
        const baseUrl = `https://storage.googleapis.com/${bucket.name}/`;
        let imagePathInStorage = decodeURIComponent(lesson.pdfUrl.replace(baseUrl, ''));
        const file = bucket.file(imagePathInStorage);
        const [lessonPdfBytes] = await file.download();
        return await PDFDocument.load(lessonPdfBytes);
    } else {
        const lessonSourcePdfDoc = await _generatePdfContentForLesson(lesson.id, lesson, lesson.learningContents, bucket);
        const lessonPdfBytes = await lessonSourcePdfDoc.save();
        const lessonStoragePath = `lessons/${lesson.id}/${lesson.id}-full.pdf`;
        const lessonFileRef = bucket.file(lessonStoragePath);
        await lessonFileRef.save(lessonPdfBytes, {
            contentType: 'application/pdf',
            cacheControl: 'public, max-age=31536000',
        });
        await lessonFileRef.makePublic();
        const lessonPublicUrl = `https://storage.googleapis.com/${bucket.name}/${lessonStoragePath}`;
        
        await firestore.collection('LESSON').doc(lesson.id).update({ pdfUrl: lessonPublicUrl });
        return lessonSourcePdfDoc;
    }
});

const lessonSourcePdfDocs = await Promise.all(lessonDocPromises);

// Step 2: Merge the completed PDFs sequentially into the course document
for (const lessonSourcePdfDoc of lessonSourcePdfDocs) {
    const copiedPages = await coursePdfDoc.copyPages(lessonSourcePdfDoc, lessonSourcePdfDoc.getPageIndices());
    copiedPages.forEach((cp) => coursePdfDoc.addPage(cp));
}


        // --- Apply page numbering to the *entire* course PDF after all lessons are merged ---
        await addPageNumbersToPdf(coursePdfDoc, font); // Use the globally available font

        const coursePdfBytes = await coursePdfDoc.save();

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

        // Issue 1 Fix: Explicitly update the pdfUrl for COURSE
        await firestore.collection('COURSE').doc(moduleId).update({ pdfUrl: publicUrlForFirestore });
        functions.logger.info(`User ${currentUserUid}: Successfully generated and linked PDF for COURSE ID: ${moduleId}`);
    }

} catch (error) {
    functions.logger.error(`User ${currentUserUid}: Error generating or uploading PDF for ${moduleType} ${moduleId}:`, error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `An unexpected error occurred during PDF generation for ${moduleType}.`, error.message);
}
// Issue 2: Return the download URL. The client-side code will need to open this in a new tab.
return { success: true, downloadUrl: temporarySignedUrl };
});
