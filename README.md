Reference here to Development.md file which should detail the process of development, the major Tags/stable bases, and future deelopment initiatives.
v1.006c  The version to start: a. basic sign in/on, b. set up vocabulary database function, c. connect to Gemini.
v1.006d  Added a 'loading' graphic to AdminSystem.html 
v1.006e  Set up function in index.js to backend generate Phoneme collection
v1.006f  Set up function in index.js to backend generate Phoneme collection as a one off. Code is left in for now and wont run unless forced from the google schedule functions page.
v1.006g  added extra fields to learningContent in index.js to show verb forms if it's a verb.
v1.006h  syllables collection, and switched to use raw IPA as the MODULEID for phonemes and syllables
v1.006K  Derive and store syllables, and store ipa value of the word along with it's syllables and phonemes
v1.006l  Reorganize index.js into modules. Tested major functions except 'sheduled ones'keep checking
v1.006m  Created GRAMMAR type modules via same framework as VOCABULARY 
v1.006n  Created Module level type content enrichment (images) for any Module Type in addition to vocab.
v1.006p  Created CONVERSATION and READINGWRITING module types, and adjusted return messaging .
v1.006q  LISTENINGSPEAKING module type, and modified functiont to create audio from text passage and upload .
v1.006r  LISTENINGSPEAKING module fixed to update learningContent with the audio url. Also  prompt Gemini to produce the SSML string to introduce pauses.
v1.006s  Created ModuleContent screen to attach/remove lessons from course, and display modules in frienly fashion for selection.
v1.006t  ModuleContent now shows description an origin meaning, and editible top level and can assign modules to modules
v1.006u  Try to make syllabification more accurate and comprehensive
v1.006v  Modularised front end. Split Modulecontent.js into separate files for list handling, editing, and Google Classroom material export.
v1.006x  Fixed Classroom Token generation process (when revoked or expired).
v1.007   Formatted ModuleCotent list view, Export to Google Classroom, modularized front end.
