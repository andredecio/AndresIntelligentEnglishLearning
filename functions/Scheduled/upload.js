import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Initialize using your private key
initializeApp({
  credential: cert('./key.json')
});

const db = getFirestore();

// 2. Combined list of all 81 unique themes
const themesList = [
  "Directions", "Describing habits and routines", "Giving personal information", "Greetings",
  "Telling the time", "Understanding and using numbers", "Understanding and using prices",
  "Connecting words: and, but, because", "Food and drink", "Nationalities and countries",
  "Personal information", "Things in the town, shops and shopping", "Verbs – basic",
  "Family life", "Hobbies and pastimes", "Holidays", "Leisure activities", "Shopping",
  "Work and jobs", "Describing past experiences", "Describing people", "Describing places",
  "Describing things", "Obligation and necessity", "Requests", "Suggestions",
  "Linkers: sequential – past time", "Adjectives: personality, description, feelings",
  "Travel and services", "Education", "Checking understanding", "Describing experiences and events",
  "Describing feelings and emotions", "Describing plans", "Expressing opinions; language of agreeing and disagreeing",
  "Initiating and closing conversation", "Managing interaction (interrupting, changing topic, resuming or continuing)",
  "Connecting words expressing cause and effect, contrast etc.", "Collocation", "Colloquial language",
  "Books and literature", "Film", "Media", "News, lifestyles and current affairs", "Critiquing and reviewing",
  "Describing experiences", "Describing hopes and plans", "Developing an argument",
  "Encouraging and inviting another speaker to continue, come in", "Expressing abstract ideas",
  "Expressing opinions", "Expressing reaction, e.g. indifference",
  "Interacting informally, reacting, expressing interest, sympathy, surprise etc.", "Opinion, justification",
  "Speculating", "Taking the initiative in interaction", "Synthesising, evaluating, closing info",
  "Discourse markers to structure formal speech", "Linkers: although, in spite of, despite",
  "Linkers: sequential – past time – subsequently", "Arts", "Conceding a point", "Critiquing and reviewing constructively",
  "Defending a point of view persuasively", "Developing an argument systematically", "Emphasising a point, feeling, issue",
  "Expressing attitudes and feelings precisely", "Expressing certainty, probability, doubt", "Expressing opinions tentatively, hedging",
  "Expressing shades of opinion and certainty", "Responding to counterarguments", "Speculating and hypothesising about causes, consequences etc.",
  "Linking devices, logical markers", "Markers to structure and signpost formal and informal speech and writing",
  "Approximating (vague language)", "Differentiated use of vocabulary", "Eliminating false friends",
  "Formal and informal registers", "Idiomatic expressions", "Scientific developments", "Technical and legal language"
];

async function uploadThemes() {
  const batch = db.batch();
  const colRef = db.collection('Themes'); // Targets the 'themes' collection

  themesList.forEach((theme) => {
    // Generates a clean Firestore ID (e.g. "food_and_drink")
    const docId = theme.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    const docRef = colRef.doc(docId);
    batch.set(docRef, { name: theme, custom: false });
  });

  await batch.commit(); // Saves all 81 documents in one batch write
  console.log("All themes have been uploaded! 🎉");
}

uploadThemes().catch(console.error);
