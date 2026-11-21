import * as functions from 'firebase-functions/v1';
import { regionalFunctions } from '../config.js'; 
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage'; // 👈 Added getStorage for failsafes
import { generateAudioAndUpload } from '../helpers/generateAudioAndUpload.js';
import { getPhonemeIDsFromSyllableIPA } from '../helpers/ipaUtils.js';
import { processModuleImageGeneration } from '../helpers/processModuleImageGeneration.js';

if (getApps().length === 0) initializeApp();

function isIpaVowel(c) {
    const v = new Set(['i', 'ɪ', 'e', 'ɛ', 'æ', 'a', 'ɑ', 'ɒ', 'ɔ', 'o', 'ʊ', 'u', 'ʌ', 'ə', 'ɜ', 'aɪ', 'aʊ', 'ɔɪ', 'eɪ', 'oʊ', 'ər', 'ɜr']);
    return v.has(c) || (c.length > 1 && v.has(c.substring(0, 2)));
}

function isIpaConsonant(c) {
    return new Set(['p', 'b', 't', 'd', 'k', 'ɡ', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'h', 'm', 'n', 'ŋ', 'l', 'r', 'w', 'j', 'tʃ', 'dʒ', 'ʔ']).has(c);
}

function splitIpaIntoSyllables(ipa) {
    if (!ipa) return [];
    let p = ipa.replace(/[ˈˌ]/g, '');
    if (p.includes('.')) return p.split('.').filter(s => s.length > 0);
    const v = /[aæʌeɛɪiɒɔuʊyəɚɜɝoøɤʉɯʏøœɑæɒɔʉɯʌəɚɜɝʀʁʔʕʢʜʢʡɕʑɧǁǃǂʘ|ʭ]/;
    const c = /[pbtdkɡfvθðszʃʒhmnŋlrjwʔɲŋʎɮʋɹɻɽɣχʀʁʕħʢʜʡɕʑçʝɫɬɮʋɹɻɽɾʈɖɳʂʐɲŋɭɬɫʀʁʕʢʜʢʡ]/;
    let s = p.replace(new RegExp(`(${v.source})(${c.source})(${v.source})`, 'g'), '$1.$2$3');
    s = s.replace(new RegExp(`(${v.source})(${c.source})(${c.source})(${v.source})`, 'g'), '$1$2.$3$4');
    return s.split('.').filter(x => x.length > 0);
}

export const onNewModuleContentCreate = regionalFunctions.runWith({
    timeoutSeconds: 540, failurePolicy: true
}).firestore.document('learningContent/{docId}').onCreate(async (snap, ctx) => {
    const data = snap.data();
    const docId = ctx.params.docId;
    const db = getFirestore();
    const bucket = getStorage().bucket(); // 👈 Access storage bucket directly

    const age = Date.now() - Date.parse(ctx.timestamp);
    if (age > 1000 * 60 * 60 * 24 * 2) {
        functions.logger.warn(`Dropping old event: ${ctx.eventId}`);
        return null;
    }

    if (data.LESSON_ID) {
        try {
            await db.collection("LESSON").doc(data.LESSON_ID).update({
                MODULEID_ARRAY: FieldValue.arrayUnion(docId)
            });
        } catch (err) {
            functions.logger.error(`Error linking ${docId}:`, err);
            throw new Error(`Failed to update LESSON: ${err.message}`);
        }
    }

    if (data.MODULETYPE === 'VOCABULARY') {
        try {
            let ipa = data.IPA || null;
            if (ipa) {
                // 🚀 STEP 1: Strict audio existence check to avoid double API billing [2.2.4]
                const audioPath = `word_audio/word_${docId}.mp3`;
                const fileRef = bucket.file(audioPath);
                const [audioExists] = await fileRef.exists();

                let audio = null;
                if (!audioExists) {
                    // Explicitly passed 5 parameters [1.2.2]
                    audio = await generateAudioAndUpload(data.TITLE, ipa, data.ttsRespelling || "", `word_${docId}`, 'word_audio/');
                } else {
                    audio = `https://storage.googleapis.com/${bucket.name}/${audioPath}`;
                    functions.logger.info(`Audio already exists for word_${docId}. Skipping API generation.`);
                }

                const payload = { IPA: ipa };
                if (audio) payload.audioUrl = audio;

                const syllables = splitIpaIntoSyllables(ipa);
                const syllableIDs = [];
                const syllColl = db.collection('syllables');
                const batch = db.batch();

                for (const syl of syllables) {
                    const sylId = syl.replace(/[.#$/[\]]/g, '_').toLowerCase();
                    const existingDoc = await syllColl.doc(sylId).get();
                    if (!existingDoc.exists) {
                        // Explicitly passed 5 parameters [1.2.2]
                        const sylAudio = await generateAudioAndUpload(syl, syl, "", `syllable_${sylId}`, 'syllable_audio/');
                        const phIds = getPhonemeIDsFromSyllableIPA(syl);
                        batch.set(syllColl.doc(sylId), {
                            MODULEID: sylId, MODULETYPE: 'SYLLABLE', TITLE: syl, IPA: syl,
                            audioUrl: sylAudio || null, MODULEID_ARRAY: phIds,
                            createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
                            normalizedTitle: syl.toLowerCase()
                        });
                    }
                    syllableIDs.push(sylId);
                }

                if (syllableIDs.length > 0) {
                    await batch.commit();
                    payload.MODULEID_ARRAY = FieldValue.arrayUnion(...syllableIDs);
                }
                await snap.ref.update(payload);
            }
        } catch (err) {
            functions.logger.error(`Processing error:`, err);
            throw err;
        }
    }

    if (data.MODULETYPE === 'LISTENINGSPEAKING') {
        // 🚀 STEP 3: Strict LISTENINGSPEAKING audio check to prevent duplicate TTS calls [2.2.4]
        const audioPath = `ListeningSpeaking_audio/word_${docId}.mp3`;
        const fileRef = bucket.file(audioPath);
        const [audioExists] = await fileRef.exists();

        let audio = null;
        if (!audioExists) {
            // Explicitly passed 5 parameters [1.2.2]
            audio = await generateAudioAndUpload(data.DESCRIPTION, "", "", `word_${docId}`, 'ListeningSpeaking_audio/');
        } else {
            audio = `https://storage.googleapis.com/${bucket.name}/${audioPath}`;
            functions.logger.info(`Audio already exists for ListeningSpeaking ${docId}. Skipping API generation.`);
        }
        if (audio) await snap.ref.update({ audioUrl: audio });
    }

    if (data.imageStatus === 'pending') {
        // 🚀 STEP 2: Strict image existence check to avoid double image generation costs [2.2.4]
        const imagePath = `module_images/${docId}.png`;
        const imageRef = bucket.file(imagePath);
        const [imageExists] = await imageRef.exists();

        if (!imageExists) {
            await processModuleImageGeneration(snap);
        } else {
            // Re-map existing image url directly [1, 2.2.4]
            const imageUrl = `https://storage.googleapis.com/${bucket.name}/${imagePath}`;
            await snap.ref.update({
                IMAGEURL: imageUrl,
                imageStatus: 'completed'
            });
            functions.logger.info(`Image already exists for module_${docId}. Skipping AI generation.`);
        }
    }
    return null;
});
