const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { getTextGenModel } = require("../helpers/gemini");
const { normalizeTitle, generateUniqueFirestoreId } = require("../helpers/ipaUtils"); // adjust path if needed
//const { Schema } = require('@firebase/ai');

// --- generateVocabularyContent Callable Function ---
// This function is called from your AdminSystem webpage to generate new vocabulary content using Gemini.
const generateVocabularyContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    // --- Security Check (Crucial for Admin Functions) ---
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    if (!context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Only authorized administrators can perform this action.');
    }
    // --- End Security Check ---

    const { cefrLevel, numWords, theme } = data;

    if (!cefrLevel || !numWords || !theme || numWords <= 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'CEFR Level, Number of Words, and Theme are required and must be valid.'
        );
    }

    functions.logger.info(`AdminSystem: Starting content generation for CEFR: ${cefrLevel}, Words: ${numWords}, Theme: ${theme}`);

    const textGenModel = getTextGenModel(); // Get the Gemini text generation model instance
    const firestore = admin.firestore(); 
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
	const skippedWords = [];
	let geminiReturnedItemCount = 0;
    let topLevelVocabCount = 0;
    let vocabGroupCount = 0;
    let nestedVocabCount = 0;
    try {
        // --- 1. Construct the sophisticated prompt for Gemini ---
        const geminiPrompt = `
        Generate a JSON array of ${numWords} vocabulary items for CEFR ${cefrLevel} level, themed around "${theme}".
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
		- "MODULETYPE": String (e.g. VOCABULARY_GROUP, VOCABULARY).
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **VOCABULARY_GROUP** (for words with multiple distinct meanings ):
            - "MODULETYPE": "VOCABULARY_GROUP"
            - "TITLE": The word (or phrase)
            - "CEFR": This must be "A1"
            - "DESCRIPTION": This must be empty
            - "THEME":This must be ${theme}
            - "WORD_TYPE": This must be empty
            - "MEANING_ORIGIN": This must contain ONLY details of the group's origin, etymology, common prefixes, infixes, or suffixes relevant to the group, NOT it's meaning.
            - "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": This must be empty
            - "SIMPLE_PAST": This must be empty
            - "PAST_PARTICIPLE": This must be empty
			- "items": An array of nested "VOCABULARY" modules, each defining a unique meaning of the word.

        2.  **VOCABULARY** (for single-meaning words, or individual meanings within a VOCABULARY_GROUP):
            - "MODULETYPE": "VOCABULARY"
            - "TITLE": The word (or phrase)
			- "IPA": String. The British English (RP) IPA transcription of the word. This MUST include:
                - Primary stress marks (ˈ)
                - Secondary stress marks (ˌ)
                - **Syllable delimiters (.), accurately placed between syllables.**
                For example:
                - "music" should be "ˈmjuː.zɪk" 
                - "apple" should be "ˈæp.əl"
                - "elephant" should be "ˈel.ɪ.fənt"
                - "important" should be "ɪmˈpɔː.tənt"
			- "CEFR": This must be "A1"
            - "DESCRIPTION": Must be 3 numbered sentences (e.g., "1. Sentence one. 2. Sentence two. 3. Sentence three.") that use the word in the context of its specific meaning
            - "THEME":This must be ${theme}
            - "WORD_TYPE": This must be one of the following: "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "article", "determiner"
            - "MEANING_ORIGIN": This must contain the meaning of the specific instance of the word. This must be followed by details of the word's origin, etymology, common prefixes, infixes, or suffixes relevant to the group.
            - "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": This has a value only when WORD_TYPE = "verb". Provide the 3rd person singular simple present tense form, e.g., "eats" for "eat"
            - "SIMPLE_PAST": This has a value only when WORD_TYPE = "verb". Provide the simple past tense form, e.g., "ate" for "eat"
            - "PAST_PARTICIPLE": This has a value only when WORD_TYPE = "verb". Provide the past participle form, e.g., "eaten" for "eat"
			- "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on one of the sentences in the DESCRIPTION field. (Only for MODULETYPE "VOCABULARY")

        **Crucial Rules for Generation:**
        - ALWAYS check first if a word has more than one meaning. You MUST create a document with VOCABULARY_GROUP MODULETYPE for a word when there is more than one possible meaning of that word. That VOCABULARY_GROUP document must have a null WORD_TYPE.Create a VOCABULARY_GROUP record if there is more than 1 meaning of the word eg. 'present' can be a verb or a noun each with different pronunciation.
		- Once you have generated a VOCABULARY_GROUP record, you MUST then create one new VOCABULARY record for each meaning of that word that you created the VOCABULARY_GROUP for.
		- **MODULETYPE:** You MUST create a unique VOCABULARY MODULETYPE document for EACH and EVERY POSSIBLE meaning of any given word. For example 'set' has more than 10 separarate meanings, so it MUST cause the creation of a VOCABULARY_GROUP MODULETYPE document, and at least 10 documents for that word with a MODULETYPE of VOCABULARY, each with their specific values for the other relevant fields described here.      
		- **CEFR Hierarchy:** For All VOCABULARY AND VOCABULARY_GROUP modules, their 'CEFR' level MUST be set to "A1").
        - **Polysemy:** If a word has multiple *distinct* meanings or functions including as different parts of speech (e.g., "book" as a noun and "book" as a verb; "like" as a verb and as an adjective, and as a preposition, and as a conjunction ), you MUST create a "VOCABULARY_GROUP" for it. This "VOCABULARY_GROUP" must contain individual "VOCABULARY" entries for *each* distinct meaning and/or part of speech. If a word has only one primary meaning, create only a single "VOCABULARY" entry directly.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numWords} top-level vocabulary items (including VOCABULARY_GROUPs).
        - **WORD_TYPE:** Values for 'WORD_TYPE' may only exist for modules with a MODULETYPE of 'VOCABULARY'.That is because a word could have more than one 'WORD_TYPE'.**This field MUST ONLY be provided for modules with "MODULETYPE": "VOCABULARY".
        - **TITLE:** This field must contain the word exclusively.
        - **MEANING_ORIGIN:** You MUST include a description of the particular meaning of that instance of a VOCABULARY MODULETYPE document AND you must add to that a description of the etymology of that instance of the word also.
		- **IPA**: This field MUST contain the British English (RP) IPA transcription, including primary (ˈ) and secondary (ˌ) stress marks, and syllable delimiters (.). Ensure accurate syllable breakdown.**This field MUST ONLY be provided for modules with "MODULETYPE": "VOCABULARY". For "VOCABULARY_GROUP" modules, this field MUST be omitted or be an empty string.**
		
		Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "cat",
			"IPA": "kæt",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. The cat sat. 2. The cat purred. 3. I like cats.",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "A carnivorous mammal of the Genus 'Felis'.originates from the Old English word "catt" (masculine) and "catte" (feminine), which themselves are derived from the Proto-West Germanic *kattu. This Germanic form likely comes from the Late Latin *cattus, first appearing around the 6th century.  ",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",
			"imagePrompt": "A fluffy cat sitting."
          },
          {
            "TITLE": "set",
            "MODULETYPE": "VOCABULARY_GROUP",
            "CEFR": "A1",
            "DESCRIPTION": "",
            "THEME":"General English",
            "WORD_TYPE": "",
            "MEANING_ORIGIN": "Old English settan, of Germanic origin; related to Dutch zetten, German setzen, also to sit."
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",

		 },
          {
            "TITLE": "set", 
            "IPA": "sɛt",
			"MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. He set the scene. 2. Have you set the table? 3. Let me set the record straight.",
            "THEME": "General English",
            "WORD_TYPE": "verb",
            "MEANING_ORIGIN": "1. put or bring into a specified state.2. put, lay, or stand (something) in a specified place or position. Old English 'settan', of Germanic origin; related to Dutch zetten, German 'setzen', also 'to sit'.",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "sets",
            "SIMPLE_PAST": "set",
            "PAST_PARTICIPLE": "set",
			"imagePrompt": "A person setting a table for a meal."
			},
          {
            "TITLE": "set",
			"IPA": "sɛt",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. Do you have a set of golf clubs? 2. I would like the whole album set. 3. Is this the complete set?",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "a group of similar things that belong together in some way. The most common meaning of "set" as a noun refers to a group of related items. This sense is related to the Old English word "set" meaning "seat" or "place," and also the Middle English "set" referring to a group or sequence. ",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",
			"imagePrompt": "A golfer holding a set of clubs."
		  },
		  {
            "TITLE": "music", 
			"IPA": "ˈmjuː.zɪk", 
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. I love to listen to music. 2. The music filled the room. 3. She studies music theory.",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "The art of combining vocal or instrumental sounds in a harmonious or expressive way. From Old French musique, from Latin musica, from Greek mousikē (tekhnē) 'art of the Muses'.",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",
            "imagePrompt": "People enjoying live music at a concert.",
        }
			
			]
        `; // This closes the backtick for the geminiPrompt multiline string.

        const result = await textGenModel.generateContent(geminiPrompt);
        const response = await result.response;
        const text = response.text();

		functions.logger.info(`Received text from Gemini. Length: ${text.length}`);
        functions.logger.info(`Raw text (first 500 chars): ${text.substring(0, 500)}`);
        functions.logger.info(`Raw text (last 500 chars): ${text.length > 500 ? text.substring(text.length - 500) : text}`);


        let generatedContent;
        try {
            generatedContent = JSON.parse(text);
			geminiReturnedItemCount = generatedContent.length; //  SET THE COUNT HERE 
            functions.logger.info(`Gemini returned ${geminiReturnedItemCount} top-level JSON items.`);
	   } catch (parseError) {
            functions.logger.error("Failed to parse Gemini output as JSON:", { rawText: text, error: parseError });
            throw new functions.https.HttpsError('internal', 'AI generation failed: Invalid JSON output from Gemini.', { rawResponse: text, parseError: parseError.message });
        }

        // --- 2. Process Generated Content and Write to Firestore (with Deduplication) ---
        for (const item of generatedContent) {
            const itemModuleType = item.MODULETYPE || 'VOCABULARY';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['VOCABULARY', 'VOCABULARY_GROUP'])
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
            if (itemModuleType === "VOCABULARY_GROUP") {
                vocabGroupCount++;
				functions.logger.info(`Processing VOCABULARY_GROUP: "${item.TITLE}".`);
				const groupId = generateUniqueFirestoreId();
                const groupRef = firestore.collection('learningContent').doc(groupId);
                const meaningIds = [];

                if (Array.isArray(item.items)) {
                    for (const meaning of item.items) {
                        if (meaning.MODULETYPE === "VOCABULARY") {
                            nestedVocabCount++;
							functions.logger.info(`  - Processing nested VOCABULARY item: "${meaning.TITLE}".`);
							const vocabId = generateUniqueFirestoreId();
                            const vocabRef = firestore.collection('learningContent').doc(vocabId);
                            //new bit below
							const verbFields = (meaning.WORD_TYPE === 'verb') ? {
							PRESENT_SIMPLE_3RD_PERSON_SINGULAR: meaning.PRESENT_SIMPLE_3RD_PERSON_SINGULAR || null,
							SIMPLE_PAST: meaning.SIMPLE_PAST || null,
							PAST_PARTICIPLE: meaning.PAST_PARTICIPLE || null,
								} : {};
							//
						   batch.set(vocabRef, {
                                MODULEID: vocabId,
                                MODULETYPE: "VOCABULARY",
                                TITLE: meaning.TITLE,
                                normalizedTitle: normalizeTitle(meaning.TITLE),
								IPA: meaning.IPA,
                                CEFR: meaning.CEFR,
                                DESCRIPTION: meaning.DESCRIPTION,
                                imagePrompt: meaning.imagePrompt,
                                THEME: meaning.THEME,
                                WORD_TYPE: meaning.WORD_TYPE,
                                MEANING_ORIGIN: meaning.MEANING_ORIGIN,
								PRESENT_SIMPLE_3RD_PERSON_SINGULAR: meaning.PRESENT_SIMPLE_3RD_PERSON_SINGULAR,
								SIMPLE_PAST: meaning.SIMPLE_PAST,
								PAST_PARTICIPLE: meaning.PAST_PARTICIPLE,
								IMAGEURL: "", // Placeholder for image URL
                                imageStatus: "pending", // Mark for batch image generation
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            meaningIds.push(vocabId);
                        } else {
                            functions.logger.warn(`Unexpected module type found in VOCABULARY_GROUP items: ${meaning.MODULETYPE}. Skipping nested item.`);
                        }
                    }
                }

                batch.set(groupRef, {
                    MODULEID: groupId,
                    MODULETYPE: "VOCABULARY_GROUP",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: "",
                    THEME: item.THEME,
                    WORD_TYPE: "",
                    MEANING_ORIGIN: item.MEANING_ORIGIN,
                    PRESENT_SIMPLE_3RD_PERSON_SINGULAR: "",
					SIMPLE_PAST: "",
					PAST_PARTICIPLE: "",
					MODULEID_ARRAY: meaningIds,
                    IMAGEURL: "",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                createdModuleIds.push(groupId);

            } else if (itemModuleType === "VOCABULARY") {
                 topLevelVocabCount++; 
                functions.logger.info(`Processing top-level VOCABULARY: "${item.TITLE}".`); 
				const vocabId = generateUniqueFirestoreId();
                const vocabRef = firestore.collection('learningContent').doc(vocabId);
				// --- NEW: Conditionally add verb conjugation fields ---
							const verbFields = (item.WORD_TYPE === 'verb') ? {
							PRESENT_SIMPLE_3RD_PERSON_SINGULAR: item.PRESENT_SIMPLE_3RD_PERSON_SINGULAR || null,
							SIMPLE_PAST: item.SIMPLE_PAST || null,
							PAST_PARTICIPLE: item.PAST_PARTICIPLE || null,
						} : {};

                batch.set(vocabRef, {
                    MODULEID: vocabId,
                    MODULETYPE: "VOCABULARY",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
					IPA: item.IPA,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
                    WORD_TYPE: item.WORD_TYPE,
                    MEANING_ORIGIN: item.MEANING_ORIGIN,
                    PRESENT_SIMPLE_3RD_PERSON_SINGULAR: item.PRESENT_SIMPLE_3RD_PERSON_SINGULAR,
					SIMPLE_PAST: item.SIMPLE_PAST,
					PAST_PARTICIPLE: item.PAST_PARTICIPLE,
					IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                createdModuleIds.push(vocabId);

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

 functions.logger.info(`Content generation summary: Requested ${numWords}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelVocabCount} top-level VOCABULARY, ${vocabGroupCount} VOCABULARY_GROUPs (containing ${nestedVocabCount} nested VOCABULARY items). Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`);//        // --- CHANGE: Trigger batchGenerateVocabularyImages (cleaned up and restored) ---
//        try {
//            // Get the functions client directly from the initialized admin object.
//            const functionsClient = admin.functions('asia-southeast1');
//            const callBatchImageGeneration = functionsClient.httpsCallable('batchGenerateVocabularyImages');
//            await callBatchImageGeneration({});
//            functions.logger.info('Successfully triggered batchGenerateVocabularyImages after content creation.');
//        } catch (callError) {
//            // Log the error but don't re-throw, as content creation was already successful.
//            functions.logger.error('Failed to trigger batchGenerateVocabularyImages (callable function):', callError);
//        }
        // --- END CHANGE: Trigger batchGenerateVocabularyImages ---

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
			skippedWords: skippedWords,
			geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelVocabCount: topLevelVocabCount,
            vocabGroupCount: vocabGroupCount,
            nestedVocabCount: nestedVocabCount
		};

    } catch (error) {
        functions.logger.error("Error generating or saving content:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
}) // This closes the exports.generateVocabularyContent function definition

module.exports = { generateVocabularyContent };

