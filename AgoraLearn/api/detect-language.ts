// Language detection utility for voice queries
// Uses franc-min for ISO 639-3 detection and maps to ISO 639-1
// Usage: detectLanguage(text: string): string

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { franc } = require('franc-min');

const isoMap = {
  'spa': 'es', 'fra': 'fr', 'ita': 'it', 'deu': 'de', 'hin': 'hi', 'ben': 'bn', 'mar': 'mr', 'rus': 'ru', 'cmn': 'zh', 'jpn': 'ja', 'ara': 'ar', 'por': 'pt', 'tur': 'tr', 'tam': 'ta', 'guj': 'gu', 'pan': 'pa', 'urd': 'ur', 'fas': 'fa', 'pol': 'pl', 'ukr': 'uk', 'eng': 'en'
};

function detectLanguage(text) {
  const langCode = franc(text);
  if (langCode === 'und') return 'en';
  return isoMap[langCode] || 'en';
}

module.exports = detectLanguage;
