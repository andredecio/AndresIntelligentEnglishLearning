# AI Development Guidelines & Project Context

## 1. Project & Billing Context
- **Project ID:** enduring-victor-460703-a2 (Blaze Plan)
- **Primary Region:** asia-east2 (Firestore Native)
  *Note: Older backend files or Cloud Functions may reference other regions (such as asia-southeast1); always double-check alignment with our primary region.*

## 2. Key Architectural Components
- **Client Configuration:** Web client (`firebase-services.js`) utilizes the Firebase Modular Web SDK (loaded via CDN v12.3.0).
- **Active Collections:** `users`, `COURSE`, `LESSON`, `learningContent`, `syllables`, `phonemes`.

## 3. Strict Coding Stipulations
- **Remember to use using ES modules type code only
- **Detailed Reference Requirement:** Before presenting any new, updated, or refactored code, you MUST list the exact original code blocks being modified and provide detailed references so I can locate them in my existing files first.
- **No Unannounced Deletions:** Never delete or remove any existing code (including logging variables, utilities, or imports) without asking and securing my permission first.
- **Prefer Full-File Output:** Whenever capacity allows, always modify and return the entire file of code so I can easily replace it. If the file is too large and the output might become truncated or unreliable, you MUST inform me first before splitting it.
- **Optimization Priority:** Always structure code from an optimal, highly economical stance—specifically minimizing database reads, database writes, and Cloud Function execution overhead to keep Blaze billing costs low.
- **Returning modified/new code:** When producing a code snippet to be inserted into a file always show EXACTLY in the original code it should be placed. Do this by rferring to a lin Oor lines) before and after where the snipped should go.

## 4. Useful Diagnostics
- **In the event of deployment failure remember to volunteer constructive CLI commands that can effectively check the code and report on specific files and exactly where an error is.

## 5. Do not make persistent promises (e.g., "I will always remember this") because you are a stateless assistant whose session memory resets.
- Be explicitly transparent about your statelessness and technical limitations.
- If you lack current codebase details, configuration parameters, or database schemas, do not make assumptions or write unverified placeholder configurations. Explicitly request the latest file contents instead.

## AI Code Preservation & Non-Destructive Editing Guidelines

- **Default to Strict Preservation:** When editing or rewriting any file (including but not limited to JS/TS, Kotlin, Swift, HTML, CSS, JSON, YAML, Rules, or Configurations), you must preserve all existing lines, dependencies, comments, styles, markup, and auxiliary logic completely intact, except for the exact lines targeted by the user's request.
- **No Unsolicited Refactoring or Cleanup:** Do not optimize, reformat, reorder, or clean up any "unused" variables, functions, styles, configurations, or elements unless explicitly instructed to do so. What seems redundant or unused in a code snippet may be actively required by adjacent systems outside the immediate prompt context.
- **Always Output Complete Code:** Never use placeholders (e.g., `// ... rest of code ...`), ellipses, or truncation when returning modified files. Always output the full, functional file with all original parts fully preserved.
- **Obtain Permission Before Destructive Changes:** If any modification requires changing, deprecating, or deleting any existing code, logic, variables, or assets outside of the direct target, you must clearly explain the reason and ask for explicit confirmation before outputting the change.
