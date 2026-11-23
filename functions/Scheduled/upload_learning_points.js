// Scheduled/upload_learning_points.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize the Admin SDK using key.json
initializeApp({
  credential: cert('./key.json')
});

const db = getFirestore();

// Raw mapping of CEFR levels to learning points
const rawData = {
  A1: [
    "Adjectives: common and demonstrative", "Adverbs of frequency", "Comparatives and superlatives", "Going to",
    "How much/how many and very common uncountable nouns", "I'd like", "Imperatives (+/-)", "Intensifiers – very basic",
    "Modals: can/can't/could/couldn't", "Past simple of 'to be'", "Past Simple", "Possessive adjectives",
    "Possessives s", "Prepositions, common", "Prepositions of place", "Prepositions of time, including in/on/at",
    "Present continuous", "Present simple", "Pronouns: simple, personal", "Questions", "There is/are",
    "To be, including question-negatives", "Verb + ing: like/hate/love"
  ],
  A2: [
    "Adjectives – comparative – use of than and definite article", "Adjectives – superlative – use of definite article",
    "Adverbial phrases of time, place and frequency – including word order", "Adverbs of frequency",
    "Articles – with countable and uncountable nouns", "Countables and Uncountables: much/many",
    "Future Time (will and going to)", "Gerunds", "Going to", "Imperatives", "Modals – can/could", "Modals – have to",
    "Modals – should", "Past continuous", "Past simple", "Phrasal verbs – common", "Possessives – use of 's, s'",
    "Prepositional phrases (place, time and movement)", "Prepositions of time: on/in/at", "Present continuous",
    "Present continuous for future", "Present perfect", "Questions", "Verb + ing/infinitive: like/want-would like",
    "Wh-questions in past", "Zero and 1st conditional"
  ],
  B1: [
    "Adverbs", "Broader range of intensifiers such as too, enough", "Comparatives and superlatives", "Complex question tags",
    "Conditionals, 2nd and 3rd", "Connecting words expressing cause and effect, contrast etc.", "Future continuous",
    "Modals – must/can't (deduction)", "Modals – might, may, will, probably", "Modals – should have/might have/etc",
    "Modals: must/have to", "Past continuous", "Past perfect", "Past simple", "Past tense responses",
    "Phrasal verbs, extended", "Present perfect continuous", "Present perfect simple (range of tenses)", "Simple passive",
    "Wh-questions in the past", "Will and going to, for prediction"
  ],
  B2: [
    "Adjectives and adverbs", "Future continuous", "Future perfect", "Future perfect continuous", "Mixed conditionals",
    "Modals – can't have, needn't have", "Modals of deduction and speculation", "Narrative tenses", "Passives",
    "Past perfect", "Past perfect continuous", "Phrasal verbs, extended", "Relative clauses", "Reported speech",
    "Will and going to, for prediction", "Wish", "Would expressing habits, in the past"
  ],
  C1: [
    "Futures (revision)", "Inversion with negative adverbials", "Mixed conditionals in past, present and future",
    "Modals in the past", "Narrative tenses for experience, incl. passive", "Passive forms, all",
    "Phrasal verbs, especially splitting", "What/only regrets"
  ]
};

// Deduplicate raw data
const learningPoints = [];
const seenKeys = new Set();

for (const [cefr, names] of Object.entries(rawData)) {
  for (const name of names) {
    const trimmedName = name.trim();
    const key = `${cefr}:${trimmedName}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      learningPoints.push({ name: trimmedName, cefr });
    }
  }
}

async function uploadLearningPoints() {
  const collectionRef = db.collection('learning_points');
  const batchLimit = 500;
  
  try {
    for (let i = 0; i < learningPoints.length; i += batchLimit) {
      const chunk = learningPoints.slice(i, i + batchLimit);
      const batch = db.batch();
      
      chunk.forEach((item) => {
        const docRef = collectionRef.doc(); // Generates a unique auto-ID
        batch.set(docRef, item);
      });
      
      await batch.commit();
      console.log(`Uploaded batch ${Math.floor(i / batchLimit) + 1} (${chunk.length} items)`);
    }
    console.log("All unique learning points successfully uploaded to Firestore!");
  } catch (error) {
    console.error("Batch upload encountered an error:", error);
  }
}

uploadLearningPoints();
