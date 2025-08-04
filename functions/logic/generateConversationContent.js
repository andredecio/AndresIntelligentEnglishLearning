const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { getTextGenModel } = require("../helpers/gemini");
const { normalizeTitle, generateUniqueFirestoreId } = require("../helpers/ipaUtils"); // adjust path if needed

// --- generateConversationContent Callable Function ---
// This function is called from your AdminSystem webpage to generate new grammar content using Gemini.
const generateConversationContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
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

    functions.logger.info(`AdminSystem: Starting Conversation content generation for CEFR: ${cefrLevel}, Items: ${numItems}, Theme: ${theme}${lessonModuleId ? `, Lesson: ${lessonModuleId}` : ''}`); // Add lessonModuleId to log

    const textGenModel = getTextGenModel(); // Get the Gemini text generation model instance
    const firestore = admin.firestore(); 
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
	const skippedWords = [];
	let geminiReturnedItemCount = 0;
    let topLevelConversationCount = 0;
    // ConversationGroupCount is not relevant for this module type, consider removing or keep for consistency if needed elsewhere.
    // let ConversationGroupCount = 0; 
    
    // 3. Prepare lessonDataToMerge for conditional LESSON_ID
    const lessonDataToMerge = lessonModuleId ? { LESSON_ID: lessonModuleId } : {}; // <-- ADD THIS LINE

    try {
        // --- 1. Construct the sophisticated prompt for Gemini ---
        const geminiPrompt = `
Generate a JSON array of ${numItems} Conversation  passages for CEFR ${cefrLevel} level, either concerning the subject of "${theme}" or in the vein of "${theme} if it is a grammatical subject (eg. Past Tense).
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
		- "MODULETYPE": String (e.g. CONVERSATION ).
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **CONVERSATION** (for conversation practice of the student):
            - "MODULETYPE": "CONVERSATION"
            - "TITLE": The title of the Conversation subject
			- "CEFR": This must be ${cefrLevel}
            - "DESCRIPTION": Must be about 10 to 20 name labelled sentences, 5 to 10 from person A. and 5 to 10 from person B. in an imaginary conversation (e.g., "Brian: Hi David, how are you? David: I'm OK thanks. Did you get my message yesterday? Brian: Message? What message? David: Didn't you see it? I left you a message on Whatsapp.
			Brian: I didn't see it, sorry. What time did you leave the message? David: Oh, about 7pm, or something. Brian: Oh that explains it. I was away from my phone at that time, and I didn't check for messages when I got back. David: Oh OK. What were you doing? Brian: Excuse me? David: I mean, what were you doing
            when I messaged you? Brian: I went to the gym. David: Oh I see.").
			- "THEME":This must be ${theme}
			- "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on the Conversation in the DESCRIPTION field, and/or the theme. 

        **Crucial Rules for Generation:**
		- **MODULETYPE:** You MUST create a unique CONVERSATION MODULETYPE document for EACH distinct and complete Conversation passage.      
		- **DESCRIPTION** You MUST label each item in the conversation, according to person A and person B speaking. So the sequence is: Person A, person B, Person A, Person B, etc. You can choose the name or title of the characters.
		- **CEFR Hierarchy:** For All CONVERSATION modules, their 'CEFR' level MUST be used to decide on the Conversation  degree of sophistication.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numItems} top-level complete Conversation items, each with a unique Conversation sequence between two people (A and B).
        - **TITLE:** This field must contain the title of the Conversation subject and/or theme.
		
		Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "Regular Verbs",
            "MODULETYPE": "Conversation",
            "CEFR": "A2",
            "DESCRIPTION": "Dad: What did you achieve today? Son: Not much dad. I was a bit distracted. Dad: Did you get carried away with your computer games again? Son: Yes, I think so. But I studied hard for a good few hours after that. Dad: Well, at least you admit it. Son: What do you mean? Dad: I mean you accept that you're not achieving as much as you should be.
			Son: That's not fair dad. I'm working hard, and I'm achieving all my work goals. Dad: Yes but if you want to do well in life, if you want to achieve more, you have to spend more time focusing on learning. Son: I'd feel better if you encouraged me rather than just criticised. Dad: OK, I see what you mean. I'm just worried you'll miss the opportunities in life.
			Son: Yes, OK. I see what you mean dad.",
            "THEME": "Verb Rules",
			"imagePrompt": "A father and teenage son in his bedroom discussing things."
          },
          {
            "TITLE": "He/She/It for Present Simple verbs",
            "MODULETYPE": "CONVERSATION",
            "CEFR": "A1",
            "DESCRIPTION": "Pete: Where does John usually go? June: He usually goes to the market. But He knows it's not good for business these days. Pete: Yes, he's right. It is very slow at the moment. June: Does Sarah sell fruit there too? Pete: Yes she does, and she says business is slow too.
           June: Maybe it's because it rains a lot there. Does it rain often there? Pete: It's often wet what where she lives? June: No, it doesn't rain that often, but it's cold. I think that's the problem. What kind of fruit does Sarah sell? Pete: I think she sells mostly exotic fruit like mangosteens, and lychees. June: Really? I think
			that's why she doesn't sell much. Pete: Does John assist her? June: He tries, but he has a lot of work himself with his own stall. If it rains he has to open the large umbrella. She doesn't have the same set up so she just get's wet along with her mangosteens, ha ha."
			"THEME": "Third Person Singular",
			"imagePrompt": "A young woman selling mangosteens in a market stall, with a young man at the next stall selling cauliflowers. It's raining, and he has a large umbrella over his stall"
		  },
          {
            "TITLE": "Fishing in the river",
            "MODULETYPE": "CONVERSATION",
            "CEFR": "B1",
            "DESCRIPTION": "Mike: Where shall we set up Bill? Bill: I've not fished here before. Can you see anywhere that looks promising MIke: Yes, I just saw a fish surface over there. Wow, that's a big one! BIll: Oh yes, OK let's both set up here. Oh, I forgot to pack my floats. Can I borrow yours? Mike: Er, alright but take care of it, it cost a lot.
            BIll: Sure. Will you be careful with the rod I lent you? Mike: Yes, yes I will. What bait are you going to use? BIll: I was thinking of worms. Did you bring any?. Ahh it jumped again. it's a big one. Mike: I want to try bread. You try worm, I'll try bread. Bill: Really? I think worm's best.
			But that's up to you. Mike: Here's the float. Be careful, OK? Bill: Don't worry. OK, I'm set up. I'm going to cast in. Did you see that fish again? Mike: Yes it's still around. Look! See? Under those tree branches. Bill: I can't see it. Oh yes!"
			"THEME": "Fishing",
			"imagePrompt": "A young woman selling mangosteens in a market stall, with a young man at the next stall selling cauliflowers. It's raining, and he has a large umbrella over his stall"
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
            const itemModuleType = item.MODULETYPE || 'CONVERSATION';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['CONVERSATION'])
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
           if (itemModuleType === "CONVERSATION") {
                 topLevelConversationCount++; 
                functions.logger.info(`Processing  CONVERSATION: "${item.TITLE}".`); 
				const conversationId = generateUniqueFirestoreId(); // Renamed variable for clarity
                const conversationRef = firestore.collection('learningContent').doc(conversationId); // Renamed variable

                batch.set(conversationRef, { // Using conversationRef
                    MODULEID: conversationId, // Using conversationId
                    MODULETYPE: "CONVERSATION",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
					IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [], // Conversation modules typically don't contain sub-modules. Keep if applicable.
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ...lessonDataToMerge // <-- ADD THIS LINE to include LESSON_ID if present
                });
                createdModuleIds.push(conversationId); // Using conversationId

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

        functions.logger.info(`Content generation summary: Requested ${numItems}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelConversationCount} CONVERSATION modules. Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`); // Adjusted log message

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
			skippedWords: skippedWords,
			geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelConversationCount: topLevelConversationCount,
            // ConversationGroupCount is not relevant for this module type, removed from return.
            // ConversationGroupCount: ConversationGroupCount, 
		};

    } catch (error) {
        functions.logger.error("Error generating or saving content:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
}) // This closes the exports.generateConversationContent function definition

module.exports = { generateConversationContent };
