/*
 * My Chinese Sentence Bank V3 language profiles.
 *
 * This file contains teaching-language choices only. Authentication and
 * teacher ownership will be added in the Firebase phase. Hindi remains the
 * compatibility profile for the existing V2 Google Sheet.
 */
const LANGUAGE_PROFILES = Object.freeze({
  hi: Object.freeze({
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    locale: 'hi-IN',
    region: 'India',
    inputHelp: 'Hindi, Romanized Hindi, or Chinese sentence',
    inputPlaceholder: 'क्योंकि तुमने अभी देना नहीं सीखा।\nKyonki tumne abhi dena nahin seekha.\nor: 因為你還沒學會給予。',
    romanizationName: 'Roman Hindi',
    requiresRomanization: true,
    legacyLabels: ['HINDI']
  }),
  ta: Object.freeze({
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    locale: 'ta-IN',
    region: 'India and Sri Lanka',
    inputHelp: 'Tamil or Chinese sentence',
    inputPlaceholder: 'தமிழ் வாக்கியத்தை இங்கே உள்ளிடவும்\nor: 請在這裡輸入中文句子。',
    romanizationName: 'Tamil Romanization',
    requiresRomanization: true,
    legacyLabels: ['TAMIL']
  }),
  th: Object.freeze({
    code: 'th',
    name: 'Thai',
    nativeName: 'ไทย',
    locale: 'th-TH',
    region: 'Thailand',
    inputHelp: 'Thai or Chinese sentence',
    inputPlaceholder: 'ใส่ประโยคภาษาไทยที่นี่\nor: 請在這裡輸入中文句子。',
    romanizationName: 'Thai Romanization',
    requiresRomanization: true,
    legacyLabels: ['THAI']
  }),
  km: Object.freeze({
    code: 'km',
    name: 'Khmer',
    nativeName: 'ខ្មែរ',
    locale: 'km-KH',
    region: 'Cambodia',
    inputHelp: 'Khmer or Chinese sentence',
    inputPlaceholder: 'សូមបញ្ចូលប្រយោគភាសាខ្មែរនៅទីនេះ\nor: 請在這裡輸入中文句子。',
    romanizationName: 'Khmer Romanization',
    requiresRomanization: true,
    legacyLabels: ['KHMER']
  }),
  vi: Object.freeze({
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    locale: 'vi-VN',
    region: 'Vietnam',
    inputHelp: 'Vietnamese or Chinese sentence',
    inputPlaceholder: 'Nhập một câu tiếng Việt ở đây.\nor: 請在這裡輸入中文句子。',
    romanizationName: 'Romanization',
    requiresRomanization: false,
    legacyLabels: ['VIETNAMESE']
  }),
  id: Object.freeze({
    code: 'id',
    name: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    locale: 'id-ID',
    region: 'Indonesia',
    inputHelp: 'Indonesian or Chinese sentence',
    inputPlaceholder: 'Masukkan satu kalimat bahasa Indonesia di sini.\nor: 請在這裡輸入中文句子。',
    romanizationName: 'Romanization',
    requiresRomanization: false,
    legacyLabels: ['INDONESIAN']
  }),
  ne: Object.freeze({
    code: 'ne',
    name: 'Nepali',
    nativeName: 'नेपाली',
    locale: 'ne-NP',
    region: 'Nepal',
    inputHelp: 'Nepali, Romanized Nepali, or Chinese sentence',
    inputPlaceholder: 'यहाँ नेपाली वाक्य लेख्नुहोस्।\nYahā̃ Nepālī vākya lekhnuhos.\nor: 請在這裡輸入中文句子。',
    romanizationName: 'Roman Nepali',
    requiresRomanization: true,
    legacyLabels: ['NEPALI']
  }),
  bn: Object.freeze({
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    locale: 'bn-BD',
    region: 'Bangladesh and India',
    inputHelp: 'Bengali, Romanized Bengali, or Chinese sentence',
    inputPlaceholder: 'এখানে একটি বাংলা বাক্য লিখুন।\nEkhāne ēkaṭi Bānlā bākya likhuna.\nor: 請在這裡輸入中文句子。',
    romanizationName: 'Roman Bengali',
    requiresRomanization: true,
    legacyLabels: ['BENGALI', 'BANGLA']
  }),
  es: Object.freeze({
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    locale: 'es-ES',
    region: 'Spanish-speaking regions',
    inputHelp: 'Spanish or Chinese sentence',
    inputPlaceholder: 'Escriba aquí una oración en español.\nor: 請在這裡輸入中文句子。',
    romanizationName: 'Romanization',
    requiresRomanization: false,
    legacyLabels: ['SPANISH']
  }),
  en: Object.freeze({
    code: 'en',
    name: 'English',
    nativeName: 'English',
    locale: 'en-US',
    region: 'International',
    inputHelp: 'English or Chinese sentence',
    inputPlaceholder: 'Enter one English sentence here.\nor: 請在這裡輸入中文句子。',
    romanizationName: 'Romanization',
    requiresRomanization: false,
    legacyLabels: ['ENGLISH']
  })
});

function getLanguageProfile(code) {
  return LANGUAGE_PROFILES[code] || LANGUAGE_PROFILES.hi;
}

function buildLanguagePrompt(profile, sentence) {
  const romanizationInstruction = profile.requiresRomanization
    ? `ROMANIZATION:\nProvide a complete Latin-script romanization of the ${profile.name} sentence.`
    : 'ROMANIZATION:\nLeave this section empty because the source language already uses Latin script.';

  return `Role Persona: You are a professional Taiwanese Mandarin teacher whose native language is ${profile.name}. Your beginner students are from ${profile.region}. Conduct all explanations in warm, clear and professional ${profile.name}.

Core Task: If I provide ${profile.name}, translate it into natural spoken Traditional Chinese as used in Taiwan. If I provide Chinese, translate it into natural ${profile.name}. Then explain the vocabulary and grammatical structure in ${profile.name}.

Formatting and Output Guidelines: Return exactly the seven section headers below in this order. Put every header on its own line exactly as written. Do not add Markdown symbols, an introduction, a conclusion, a note, or an additional section.

SOURCE:
Write the complete ${profile.name} sentence. If the input is Chinese, translate it into natural ${profile.name}.

CHINESE:
Provide an accurate, natural translation using Traditional Chinese characters exclusively and wording commonly used in Taiwan.

PINYIN:
Provide complete Hanyu Pinyin with correct tone marks and punctuation.

${romanizationInstruction}

EXPLANATION:
Explain the full meaning, important words, useful phrases, measure words, word order and grammar in ${profile.name}. Whenever Chinese appears, always show the Traditional Chinese, Pinyin and ${profile.name} meaning together in this format: 漢字 (pīnyīn) - ${profile.name} explanation.

CATEGORY:
Choose exactly one: Daily Life, School, Home, Restaurant, Shopping, Bank, Hospital, Travel, Train & Bus, Airport, Work, Friends, Other

TAGS:
Provide 3 to 6 short English search keywords separated by commas.

Sentence to be explained:
${sentence}`;
}
