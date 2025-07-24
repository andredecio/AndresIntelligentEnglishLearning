// generate_syllable_json.js
const fs = require('fs');

const inputFilePath = '3000 of CMU syllables.txt'; // Make sure this path is correct!
const numSyllablesToGenerate = 3000;

try {
    const data = fs.readFileSync(inputFilePath, 'utf8');
    const lines = data.split('\n');

    const syllablesArray = [];
    let count = 0;

    for (const line of lines) {
        if (count >= numSyllablesToGenerate) {
            break; // Stop after processing the desired number of syllables
        }

        const trimmedLine = line.trim();
        if (trimmedLine) { // Ensure the line is not empty
            const parts = trimmedLine.split('\t'); // Split by tab
            if (parts.length > 0) {
                const ipa = parts[0];
                syllablesArray.push({
                    ipa: ipa,
                    title: `Syllable: ${ipa}` // Dynamic title based on IPA
                });
                count++;
            }
        }
    }

    // Print the array as a JSON string to the console
    // This is what you'll copy and paste into index.js
    console.log(JSON.stringify(syllablesArray, null, 2));
    console.log(`\nGenerated JSON for ${syllablesArray.length} syllables.`);

} catch (err) {
    console.error('Error reading or processing the file:', err);
}
