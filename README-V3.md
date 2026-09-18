# My Chinese Sentence Bank V3 Working Copy

## Current status

This folder is an independent V3 working copy made from the uploaded V2 project. It does not alter or deploy the live V2 website.

Completed in the first upgrade increment:

- Preserved the existing sentence cards, search, pronunciation lab, recordings, teacher model audio and sentence deletion.
- Added source-language profiles for Hindi, Tamil, Thai, Khmer, Vietnamese, Indonesian, Nepali, Bengali, Spanish and English.
- Added a source-language selector to the AI prompt builder.
- Added prompt generation based on the selected language.
- Added neutral output labels: `SOURCE`, `CHINESE`, `PINYIN`, `ROMANIZATION`, `EXPLANATION`, `CATEGORY` and `TAGS`.
- Kept compatibility with the older `HINDI` and `ROMAN` labels.
- Added neutral in-memory fields while retaining V2 aliases for existing data.
- Added source-language speech locale selection.
- Extracted the supplied `BankApi.gs` and `RowHelper.gs` into the `apps-script` folder.
- Connected the registered Firebase V3 web application.
- Added Google teacher sign-in, account display and sign-out controls.
- Publishes the authenticated teacher UID to the page for the next data-isolation phase.

## Important safety limit

The existing Google Sheet schema is still Hindi-specific. Until Firebase Authentication and the V3 teacher database are connected:

- Hindi can continue using the existing V2 storage path.
- Tamil, Thai, Khmer, Vietnamese, Indonesian, Nepali, Bengali, Spanish and English can generate prompts and preview sentence cards.
- Saving a non-Hindi sentence is intentionally blocked so it cannot be written into the wrong V2 columns.

## Files added or changed

- `language-config.js`: supported languages and prompt generator.
- `index.html`: source-language selector and neutral instructions.
- `app.js`: neutral parsing, display aliases and language-aware speech.
- `styles.css`: selector and multilingual font support.
- `apps-script/BankApi.gs`: latest supplied backend source.
- `apps-script/RowHelper.gs`: latest supplied row helper.
- `firebase-config.js`: Firebase V3 public web configuration.
- `firebase-auth.js`: Google sign-in and teacher identity state.

## Next implementation increment

1. Add the GitHub Pages domain to Firebase Authorized domains.
2. Test Google sign-in from the V3 test URL.
3. Add an invitation-only teacher profile collection.
4. Store each teacher's sentences below their authenticated UID.
5. Add per-teacher audio storage and security rules.
6. Migrate the owner's current Hindi records after isolation tests pass.
