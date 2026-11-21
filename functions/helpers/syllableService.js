import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { generateAudioAndUpload } from './generateAudioAndUpload.js'; 
import { getPhonemeIDsFromSyllableIPA } from './ipaUtils.js';

if (getApps().length === 0) {
    initializeApp();
}

export async function parseAndLinkSyllables(ipa, ttsRespelling = '') {
    if (!ipa) return [];

    // Normalize stress marks to dots so they act as split boundaries
    const normalizedIpa = ipa.replace(/[ˈˌ]/g, '.');

    // Split compound phrases by space first
    const ipaWords = normalizedIpa.split(/\s+/).filter(Boolean);
    const respellingWords = ttsRespelling
        ? ttsRespelling.split(/\s+/).filter(Boolean)
        : [];

    const syllableIds = [];
    for (let w = 0; w < ipaWords.length; w++) {
        const ipaWord = ipaWords[w];
        const respellingWord = (respellingWords.length === ipaWords.length) 
            ? respellingWords[w] 
            : '';

        // Split individual word by dots / hyphens
        const ipaParts = ipaWord.split('.').map(s => s.trim()).filter(Boolean);
        const respellingParts = respellingWord
            ? respellingWord.split('-').map(s => s.trim()).filter(Boolean)
            : [];

        for (let i = 0; i < ipaParts.length; i++) {
            const syllableIpa = ipaParts[i];
            const syllableRespelling = (respellingParts.length === ipaParts.length) 
                ? respellingParts[i] 
                : syllableIpa;

            const id = await getOrCreateSyllableDocument(syllableIpa, syllableRespelling);
            syllableIds.push(id);
        }
    }
    return syllableIds;
}

export async function getOrCreateSyllableDocument(syllableIpa, ttsRespelling = '') {
    if (!syllableIpa) return null;

    const firestore = getFirestore();
    
    // 1. Remove stress marks AND any phonetic slashes (/) wrapping the IPA
    const cleanId = syllableIpa.replace(/[ˈˌ\/]/g, '').trim(); 

    // 2. Safeguard: If the resulting ID is empty, exit early instead of crashing
    if (!cleanId || cleanId === '') {
        console.warn(`Skipping invalid/empty syllable ID for: "${syllableIpa}"`);
        return null;
    }

    const docRef = firestore.collection('syllables').doc(cleanId); // Now completely safe!
    const snap = await docRef.get();    

    if (snap.exists) return snap.id;

    // Use ttsRespelling if available to prevent letter-by-letter spelling out
    const textToSpeak = ttsRespelling || cleanId;
	const audioUrl = await generateAudioAndUpload(
		textToSpeak,       // 1. text (the readable word/syllable, e.g., "loch")
		textToSpeak,       // 2. ipaForSsml (the IPA representation)
		textToSpeak,       // 3. ttsRespelling (used as standard pronunciation fallback)
		cleanId,           // 4. fileNamePrefix (the unique Firestore ID for the file)
		'syllable_audio/'  // 5. storagePathPrefix
);
    
    const phonemeIds = getPhonemeIDsFromSyllableIPA(cleanId);

    await docRef.set({
        MODULEID: cleanId,
        MODULETYPE: 'SYLLABLE',
        TITLE: cleanId, // Fixed: removed "Syllable: " hardcoding
        IPA: cleanId,
        DESCRIPTION: `Audio and details for the English syllable "${cleanId}".`,
        normalizedTitle: cleanId.toLowerCase(),
        audioUrl,
        MODULEID_ARRAY: phonemeIds,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    return cleanId;
}
