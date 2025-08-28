const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { getTextGenModel } = require("../helpers/gemini");
const { normalizeTitle, generateUniqueFirestoreId } = require("../helpers/ipaUtils"); // adjust path if needed

// --- generate Reading-WritingContent Callable Function ---
// This function is called from your AdminSystem webpage to generate new Reading and Writing content using Gemini.
const generateReadingWritingContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
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

    functions.logger.info(`AdminSystem: Starting Reading-Writing content generation for CEFR: ${cefrLevel}, Items: ${numItems}, Theme: ${theme}${lessonModuleId ? `, Lesson: ${lessonModuleId}` : ''}`); // Add lessonModuleId to log

    const textGenModel = getTextGenModel(); // Get the Gemini text generation model instance
    const firestore = admin.firestore(); 
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
	const skippedWords = [];
	let geminiReturnedItemCount = 0;
    let topLevelReadingWritingCount = 0;
    // ReadingWritingGroupCount is not relevant for this module type, consider removing or keep for consistency if needed elsewhere.
    // let ReadingWritingGroupCount = 0; 

    // 3. Prepare lessonDataToMerge for conditional LESSON_ID
    const lessonDataToMerge = lessonModuleId ? { LESSON_ID: lessonModuleId } : {}; // <-- ADD THIS LINE

    try {
        // --- 1. Construct the sophisticated prompt for Gemini ---
        const geminiPrompt = `
Generate a JSON array of ${numItems} ReadingWriting  exercises for CEFR ${cefrLevel} level, concerning the subject of "${theme}" and with reference to  the teaching points of "${theme} if it is a grammatical subject (eg. Past Tense).
        Each item in the array will comprise an interesting and topical reading passage of between 100 and 200 words, followed by 5 numbered questions that require a written answer, concerning comprehension of the points of the passage.
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
		- "MODULETYPE": String (e.g. READING-WRITING ).
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **READING-WRITING** (for comprehension reading and writing practice of the student):
            - "MODULETYPE": "READING-WRITING"
            - "TITLE": The title of the Reading-Writing subject
			- "CEFR": This must be ${cefrLevel}
            - "DESCRIPTION": Must be about 100 to 200 word long passage on a subject related to the TITLE, and exemplifying the grammar (if any) explicit in the THEME. It MUST be followed by 5 numbered questions to the user that test the user's reading comprehension.
			- "THEME":This MUST have the literal value  ${theme} exclusively
			- "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on the subject of the passage in the DESCRIPTION field, and/or the theme. 

        **Crucial Rules for Generation:**
		- The entire response MUST be a single, perfectly valid JSON array, strictly conforming to JSON syntax (e.g., correct commas, brackets, and quotes). Any deviation from standard JSON syntax will render the output unusable.
		- **MODULETYPE:** You MUST create a unique READING-WRITING MODULETYPE document for EACH distinct and complete Reading-Writing passage.      
		- **DESCRIPTION** You MUST create an interesting and topical passage that is related to the TITLE but also exemplifying the THEME if it is a grammatical THEME.This MUST be followed by 5 numbered comprehension questions about the passge, appropriate for the CEFR level of this module.
		- **CEFR Hierarchy:** For All READING-WRITING modules, their 'CEFR' level MUST be used to decide on the degree of sophistication of the exercise detailed in DESCRIPTION.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numItems} top-level complete Reading-Writing items, each with a unique exercise containing a reading passage and 5 numbered questions.
        - **TITLE:** This field must contain the title of the Reading-Writing subject and/or theme.
		
		Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "Regular Verbs",
            "MODULETYPE": "Reading-Writing",
            "CEFR": "A2",
            "DESCRIPTION": "Stonehenge stands in the south of England. People visit it every year. It has many big stones. Some stones stand in a circle. Others rest on the ground. Long ago, people moved these stones from far away. 
			They used simple tools. No one knows why they built Stonehenge. Some people say it was a place for the sun. Others believed it was for special events. On the longest day of the year, the sun rises between two stones. 
			This sight amazed people and made them think about the past. Today, people walk around the stones. They take photos and learn about history. A group of workers cleans the area and helps visitors. Stonehenge gives us many questions. 
			We look at the stones and wonder about the people who lived long ago. What did they think? What did they feel? We still try to understand this old and special place.
			**Comprehension Questions:**
			Write your answers in full sentences

			1. Where does Stonehenge stand?
			2. What do people do when they visit Stonehenge?
			3. How did people move the stones in the past?
			4. What happens on the longest day of the year at Stonehenge?
			5. Why do people still wonder about Stonehenge today?",
            "THEME": "Verb Rules",
			"imagePrompt": "A beautiful view of Ancient Stonehenge in its prime with ancient people"
          },
          {
            "TITLE": "Jane Goodall",
            "MODULETYPE": "READING-WRITING",
            "CEFR": "A1",
            "DESCRIPTION": "Jane Goodall studies animals. She works with chimpanzees in Africa. She lives in the UK, but she often travels for her work. Jane gives talks, visits schools, and shares her stories with people around the world. 
			She teaches others about animals and the environment. Jane also runs a group called the Jane Goodall Institute. It protects nature and helps young people learn about science. She believes that one person makes a big difference. 
			Every day, she speaks to children, leaders, and scientists. She asks them to care about animals. Jane loves nature, and she spends her time helping the planet. People listen to her because she knows so much. 
			Even though she is older now, she still works hard. Jane Goodall shows us that one voice changes the world.
			**Comprehension Questions:**
			Write your answers in full sentences

			1. Where does Jane Goodall often travel for her work?
			2. What animals does she study?
			3. What does the Jane Goodall Institute do?
			4. Who does Jane speak to every day?
			5. Why do people listen to her?",
			"THEME": "Chimpanzees and Ecology",
			"imagePrompt": "Jane Goodall sitting next to a chimpanzee"

		  },
          {
            "TITLE": "Dr Jane Goodall",
            "MODULETYPE": "READING-WRITING",
            "CEFR": "C1",
            "DESCRIPTION": "Jane Goodall is one of the world’s most respected primatologists. She became known in the 1960s for her pioneering work with wild chimpanzees in Tanzania. 
			Rather than relying on detached observation, she immersed herself in their world, patiently gaining their trust. Her discoveries—such as chimpanzees using tools, 
			forming emotional bonds, and engaging in social rituals—redefined the way scientists view animal intelligence and behaviour.
			Today, Goodall no longer conducts field research, but she remains deeply involved in conservation. She travels the globe to raise awareness about environmental issues, 
			speak at conferences, and promote her Roots & Shoots program, which empowers young people to protect animals and the planet. Despite her age, she maintains a demanding schedule, 
			fuelled by hope and a strong moral purpose.
			Goodall’s message is clear: every individual can make a difference. She urges people to act mindfully—whether by reducing waste, protecting wildlife, or making sustainable choices. 
			Her calm yet passionate voice continues to inspire global audiences toward compassion and action.
			**Comprehension & Inference Questions:**
			Write your answers in full sentences

			1. What approach did Goodall take in her early research that made it unique?
			2. What key behaviours did she observe in chimpanzees?
			3. What is the main focus of her work today?
			4. What motivates her continued efforts despite her age?
			5. What is the central message she shares with the public?",
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
            const itemModuleType = item.MODULETYPE || 'READING-WRITING';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['READING-WRITING'])
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
           if (itemModuleType === "READING-WRITING") {
                 topLevelReadingWritingCount++; 
                functions.logger.info(`Processing  READING-WRITING: "${item.TITLE}".`); 
				const readingWritingId = generateUniqueFirestoreId(); // Renamed variable for clarity
                const readingWritingRef = firestore.collection('learningContent').doc(readingWritingId); // Renamed variable

                batch.set(readingWritingRef, { // Using readingWritingRef
                    MODULEID: readingWritingId, // Using readingWritingId
                    MODULETYPE: "READING-WRITING",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
					IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [], // Reading-Writing modules typically don't contain sub-modules. Keep if applicable.
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ...lessonDataToMerge // <-- ADD THIS LINE to include LESSON_ID if present
                });
                createdModuleIds.push(readingWritingId); // Using readingWritingId

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

        functions.logger.info(`Content generation summary: Requested ${numItems}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelReadingWritingCount} READING-WRITING modules. Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`); // Adjusted log message

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
			skippedWords: skippedWords,
			geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelReadingWritingCount: topLevelReadingWritingCount,
            // ReadingWritingGroupCount is not relevant for this module type, removed from return.
            // ReadingWritingGroupCount: ReadingWritingGroupCount, 
		};

    } catch (error) {
        functions.logger.error("Error generating or saving content:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
}) // This closes the exports.generateReadingWritingContent function definition

module.exports = { generateReadingWritingContent };
