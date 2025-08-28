const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { getTextGenModel } = require("../helpers/gemini");
const { normalizeTitle, generateUniqueFirestoreId } = require("../helpers/ipaUtils"); // adjust path if needed

// --- generateListeningSpeakingContent Callable Function ---
// This function is called from your AdminSystem webpage to generate new Listening and Speaking content using Gemini.
const generateListeningSpeakingContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    // --- Security Check (Crucial for Admin Functions) ---
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    if (!context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Only authorized administrators can perform this action.');
    }
    // --- End Security Check ---

    // 1. Destructure lessonModuleId from the incoming data
    const { cefrLevel, numItems, theme, lessonModuleId } = data; // <-- ADD lessonModuleId here

    // 2. Adjust validation to allow 0 numItems
    if (!cefrLevel || !theme || typeof numItems !== 'number' || numItems < 0) { // Changed to numItems < 0 to allow 0
        throw new functions.https.HttpsError(
            'invalid-argument',
            'CEFR Level, Number of Items (must be a number >= 0), and Theme are required and must be valid.'
        );
    }

    functions.logger.info(`AdminSystem: Starting ListeningSpeaking content generation for CEFR: ${cefrLevel}, Items: ${numItems}, Theme: ${theme}${lessonModuleId ? `, Lesson: ${lessonModuleId}` : ''}`); // Add lessonModuleId to log

    const textGenModel = getTextGenModel(); // Get the Gemini text generation model instance
    const firestore = admin.firestore(); 
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
	const skippedWords = [];
	let geminiReturnedItemCount = 0;
    let topLevelListeningSpeakingCount = 0;
    // ListeningSpeakingGroupCount is not relevant for this module type, consider removing or keep for consistency if needed elsewhere.
    // let ListeningSpeakingGroupCount = 0; 

    // 3. Prepare lessonDataToMerge for conditional LESSON_ID
    const lessonDataToMerge = lessonModuleId ? { LESSON_ID: lessonModuleId } : {}; // <-- ADD THIS LINE

    try {
        // --- 1. Construct the sophisticated prompt for Gemini ---
        const geminiPrompt = `
Generate a JSON array of ${numItems} Listening Speaking  exercises for CEFR ${cefrLevel} level, concerning the subject of "${theme}" and with reference to  the teaching points of "${theme} if it is a grammatical subject (eg. Past Tense).
        Each item in the array will comprise an interesting and topical reading passage of just 3 numbered sentences, preceded by the statement: "Please repeat these after me..." followed by a sentence, then a pause to enable the user to repeat the sentence back.
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
		- "MODULETYPE": String (e.g. LISTENINGSPEAKING ).
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **LISTENINGSPEAKING** (for listening and speaking practice of the student):
            - "MODULETYPE": "LISTENINGSPEAKING"
            - "TITLE": The title of the ListeningSpeaking subject
			- "CEFR": This must be ${cefrLevel}
            - "DESCRIPTION": Must begin with the literal string "<speak> Please repeat these three sentences <break time='2s'/> Number 1 <break time='2s'/> " and then, for example: "Stonehenge is a very interesting archaeological site.", then "<break time='?s'/> Number 2 <break time='2s'/> " then for example: "It is located in Southern England on Salisbury Plain in Wiltshire.<break time='?s'/> Number 3 <break time='2s'/> " then for example "Stonehenge is owned by the charitable organisation called The National Trust." and then end with "</speak>" where '?' is replaced with the number of words in the sentence divided by 2 and then add 2.
			- "THEME":This MUST have the literal value  ${theme} exclusively
			- "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on the sentences in the DESCRIPTION field, and/or the theme. 

        **Crucial Rules for Generation:**
		- The entire response MUST be a single, perfectly valid JSON array, strictly conforming to JSON syntax (e.g., correct commas, brackets, and quotes). Any deviation from standard JSON syntax will render the output unusable.
		- **MODULETYPE:** You MUST create a unique LISTENINGSPEAKING MODULETYPE document for EACH distinct and complete set of 3 sentences.      
		- **DESCRIPTION** You MUST create 3 sentences that are related to the TITLE but also exemplifying the THEME if it is a grammatical THEME.The string MUST begin specifically with: "<speak>Please repeat these three sentences <break time='2s'/> Number 1 <break time='2s'/> " and after the inserted sentence what MUST follow is: "<break time='?s'/> Number 2 <break time='2s'/> " then  after the 2nd inserted sentence what MUST follow is: "<break time='?s'/> Number 3 <break time='2s'/> " and after the 3rd inserted sentence what MUST follow is: "</speak> " '?' should be replaced by an integer equal to the number of words in the preceding sentence, divided by 2 and add 2. eg. if there are 10 words in the sentence the value should be 7.
						This format is required to conform to SSML format for TTS application. The number of seconds to pause after each sentence should be proportional to the number of words in the sentence. For example if the first sentance has 10 words the the break time value shold = 6s ie. half a second per word plus one second.
		- **CEFR Hierarchy:** For All LISTENINGSPEAKING modules, their 'CEFR' level MUST be used to decide on the degree of sophistication of the 3 sentences detailed in DESCRIPTION.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numItems} top-level complete Reading-Writing items, each with a unique exercise containing a reading passage and 5 numbered questions.
        - **TITLE:** This field must contain the title of the ListeningSpeaking subject and/or theme.
		
		Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "Regular Verbs",
            "MODULETYPE": "LISTENINGSPEAKING",
            "CEFR": "A2",
            "DESCRIPTION": "<speak> Please repeat these three sentences <break time='2s'/> Number 1 <break time='2s'/> The mysterious stones of  Stonehenge stand in the south of England. <break time='7s'/> Number 2 <break time='2s'/> People visit it every year. <break time='4s'/> Number 3 <break time='2s'/> It has many big stones in a circle.</speak>"
            "THEME": "Verb Rules",
			"imagePrompt": "A beautiful view of Ancient Stonehenge in its prime with ancient people"
          },
          {
            "TITLE": "Jane Goodall",
            "MODULETYPE": "LISTENINGSPEAKING",
            "CEFR": "A1",
            "DESCRIPTION": "<speak> Please repeat these three sentences <break time='2s'/> Number 1 <break time='2s'/> Jane Goodall studies animals. She works with chimpanzees in Africa. <break time='6s'/> Number 2 <break time='2s'/> She lives in the UK, but she often travels for her work. <break time='7s'/> Number 3 <break time='2s'/> Jane gives talks, visits schools, and shares her stories with people around the world.</speak>"
			"THEME": "Chimpanzees and Ecology",
			"imagePrompt": "Jane Goodall sitting next to a chimpanzee"

		  },
          {
            "TITLE": "Dr Jane Goodall",
            "MODULETYPE": "LISTENINGSPEAKING",
            "CEFR": "C1",
            "DESCRIPTION": "<speak> Please repeat these three sentences <break time='2s'/> Number 1 <break time='2s'/> Jane Goodall is one of the world’s most respected primatologists. <break time='6s'/> Number 2 <break time='2s'/> She became known in the 1960s for her pioneering work with wild chimpanzees in Tanzania. <break time='9s'/> Number 3 <break time='2s'/> Rather than relying on detached observation, she immersed herself in their world. </speak>"
			"THEME": "Chimpanzees and Ecology",
			"imagePrompt": "A Jane Goodall hugging a chimpanzee"
		  },
			
			]
        `; 

        const result = await textGenModel.generateContent(geminiPrompt);
        const response = await result.response;
        const rawText = await response.text();


        // Clean & parse
        const cleanedText = rawText
            .trim()
            .replace(/^```json/, '')
            .replace(/```$/, '')
            .replace(/\s*}+\s*$/, ']');  // Fix Gemini's trailing brace issue
		
		functions.logger.info(`Cleaned text from Gemini. Length: ${cleanedText.length}`);
        functions.logger.info(`Cleaned text (first 500 chars): ${cleanedText.substring(0, 500)}`);
        functions.logger.info(`Cleaned text (last 500 chars): ${cleanedText.length > 500 ? cleanedText.substring(cleanedText.length - 500) : cleanedText}`);


        let generatedContent;
        try {
            generatedContent = JSON.parse(cleanedText);
			geminiReturnedItemCount = generatedContent.length; //  SET THE COUNT HERE 
            functions.logger.info(`Gemini returned ${geminiReturnedItemCount} top-level JSON items.`);
	   } catch (e) {
            functions.logger.error("Failed to parse Gemini JSON:", cleanedText);
            throw new functions.https.HttpsError('internal', "Failed to parse Gemini output as JSON.", e.message);
        }

        // --- 2. Process Generated Content and Write to Firestore (with Deduplication) ---
        for (const item of generatedContent) {
            const itemModuleType = item.MODULETYPE || 'LISTENINGSPEAKING';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['LISTENINGSPEAKING'])
                .where('normalizedTitle', '==', itemNormalizedTitle)
                .limit(1)
                .get();

            if (!existingContentSnapshot.empty) {
                functions.logger.info(`Skipping "${item.TITLE}" (${itemModuleType}) as a record with this title already exists.`);
                numSkipped++;
                skippedWords.push(item.TITLE);
				continue;
            }

            // --- If the item is NOT skipped, process it and add to the Firestore batch ---
           if (itemModuleType === "LISTENINGSPEAKING") {
                 topLevelListeningSpeakingCount++; 
                functions.logger.info(`Processing  LISTENINGSPEAKING: "${item.TITLE}".`); 
				const listeningSpeakingId = generateUniqueFirestoreId(); // Renamed variable for clarity
                const listeningSpeakingRef = firestore.collection('learningContent').doc(listeningSpeakingId); // Renamed variable

                batch.set(listeningSpeakingRef, { // Using listeningSpeakingRef
                    MODULEID: listeningSpeakingId, // Using listeningSpeakingId
                    MODULETYPE: "LISTENINGSPEAKING",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
					IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [], // ListeningSpeaking modules typically don't contain sub-modules. Keep if applicable.
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ...lessonDataToMerge // <-- ADD THIS LINE to include LESSON_ID if present
                });
                createdModuleIds.push(listeningSpeakingId); // Using listeningSpeakingId

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

        functions.logger.info(`Content generation summary: Requested ${numItems}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelListeningSpeakingCount} LISTENINGSPEAKING modules. Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`); // Adjusted log message

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
			skippedWords: skippedWords,
			geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelListeningSpeakingCount: topLevelListeningSpeakingCount,
            // ListeningSpeakingGroupCount is not relevant for this module type, removed from return.
            // ListeningSpeakingGroupCount: ListeningSpeakingGroupCount, 
		};

    } catch (error) {
        functions.logger.error("Error generating or saving content:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
}) // This closes the exports.generateListeningSpeakingContent function definition

module.exports = { generateListeningSpeakingContent };
