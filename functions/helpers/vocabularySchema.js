
const { Schema } = require('@firebase/ai');


// Define the expected JSON schema for vocabulary content.
const vocabularySchema = Schema.array({
    items: Schema.object({
        properties: {
            TITLE: Schema.string(),
			IPA:  Schema.string(),
            CEFR: Schema.string(),
            DESCRIPTION: Schema.string(),
            THEME: Schema.enumString({ enum: ['General English'] }),
            MODULETYPE: Schema.string(), // Expected: "VOCABULARY" or "VOCABULARY_GROUP"
            WORD_TYPE: Schema.enumString({ enum: ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', "conjunction", "interjection", "article", "determiner"] }),
            MEANING_ORIGIN: Schema.string(),
            PRESENT_SIMPLE_3RD_PERSON_SINGULAR: Schema.string(),
            SIMPLE_PAST: Schema.string(),
            PAST_PARTICIPLE: Schema.string(),
			imagePrompt: Schema.string(),
            items: Schema.array({
                items: Schema.object({
                    properties: {
                        TITLE: Schema.string(),
						IPA:  Schema.string(),
                        CEFR: Schema.string(),
                        DESCRIPTION: Schema.string(),
                        THEME: Schema.enumString({ enum: ['General English'] }),
                        MODULETYPE: Schema.string(), // Expected: "VOCABULARY" for nested items
                        WORD_TYPE: Schema.enumString({ enum: ['noun', 'verb', 'adjective', 'adverb', "pronoun", "preposition", "conjunction", "interjection", "article", "determiner"] }),
                        MEANING_ORIGIN: Schema.string(),
                        PRESENT_SIMPLE_3RD_PERSON_SINGULAR: Schema.string(),
						SIMPLE_PAST: Schema.string(),
						PAST_PARTICIPLE: Schema.string(),
						imagePrompt: Schema.string(),
                    },
                    required: ["TITLE", "CEFR", "DESCRIPTION", "THEME", "MODULETYPE", "WORD_TYPE", "MEANING_ORIGIN", "imagePrompt"],
                    propertyOrdering: [
                        "MODULETYPE", "TITLE", "IPA", "DESCRIPTION", "WORD_TYPE", "CEFR", "THEME", "MEANING_ORIGIN", 
						"PRESENT_SIMPLE_3RD_PERSON_SINGULAR", "SIMPLE_PAST", "PAST_PARTICIPLE", "imagePrompt"
					]
                }),
            }),
        },
        required: ["TITLE", "CEFR", "DESCRIPTION", "THEME", "MODULETYPE", "WORD_TYPE", "MEANING_ORIGIN"],
        optionalProperties: ["imagePrompt", "items", "PRESENT_SIMPLE_3RD_PERSON_SINGULAR", "SIMPLE_PAST", "PAST_PARTICIPLE"],
        propertyOrdering: [
            "MODULETYPE", "TITLE", "IPA", "DESCRIPTION", "WORD_TYPE", "CEFR", "THEME", "MEANING_ORIGIN", 
								"PRESENT_SIMPLE_3RD_PERSON_SINGULAR", "SIMPLE_PAST", "PAST_PARTICIPLE", "imagePrompt", "items"

		]
    }),
});

module.exports = { vocabularySchema };
