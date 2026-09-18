const API_URL = 'https://script.google.com/macros/s/AKfycbw9trkW9RNCRSwWou_51Q-FP6aL7Lp8sy3zizSG83fzN1Urtd3ZiMc47RUfHDBTIMJfDw/exec';
const SAMPLE = `HINDI:\nमुझे बैंक से पैसे निकालने हैं।\n\nCHINESE:\n我要去銀行領錢。\n\nPINYIN:\nWǒ yào qù yínháng lǐng qián.\n\nROMAN:\nMujhe bank se paise nikaalne hain.\n\nEXPLANATION:\n我要 (wǒ yào) का अर्थ है “मैं ... करना चाहता/चाहती हूँ।”\n去 (qù) का अर्थ “जाना” है।\n銀行 (yínháng) का अर्थ “बैंक” है।\n領錢 (lǐng qián) का अर्थ बैंक से पैसे निकालना है।\n中文語序 (Zhōngwén yǔxù): 主語 (zhǔyǔ) + 要 (yào) + 去 (qù) + 地點 (dìdiǎn) + 動作 (dòngzuò)。\n\nCATEGORY:\nBank`;
const AI_PROMPT = `You are a Taiwanese Mandarin teacher for a Hindi-speaking beginner. Convert the Hindi sentence below into natural Traditional Chinese used in Taiwan.\n\nHINDI SENTENCE:\n[Paste one Hindi sentence here]\n\nReturn ONLY the following labelled sections. Do not add an introduction or conclusion. Keep every label exactly as written and do not add Markdown symbols such as ** around the labels.\n\nHINDI:\n[Repeat the original Hindi sentence]\n\nCHINESE:\n[One natural Traditional Chinese sentence used in Taiwan]\n\nPINYIN:\n[Hanyu Pinyin with tone marks for the complete Chinese sentence]\n\nEXPLANATION:\n[Explain every Chinese word and the grammar in clear Hindi. Whenever any Chinese character, word, phrase, or example appears, immediately add its pinyin in parentheses. Use Traditional Chinese only.]\n\nCATEGORY:\n[Choose exactly one: Daily Life, School, Home, Restaurant, Shopping, Bank, Hospital, Travel, Train & Bus, Airport, Work, Friends, Other]\n\nTAGS:\n[Three to five short English keywords separated by commas]\n\nAI SOURCE:\n[Write ChatGPT or Gemini]`;
const AI_PROMPT_TEMPLATE = `Role Persona: You are a professional Chinese language teacher whose native language is Hindi. Your students are beginners from India learning Chinese. Conduct all teaching, guidance, and explanations in warm, friendly, and professional Hindi throughout.

Core Task: If I provide Hindi or Romanized Hindi, translate it into natural spoken Traditional Chinese as used in Taiwan. If I provide Chinese, translate it into natural Hindi. Then explain its vocabulary and grammatical structure entirely in Hindi.

Formatting and Output Guidelines: Return exactly the seven section headers below in this order. Put every header on its own line exactly as written, without Markdown symbols such as ** or #. Do not omit any section.

HINDI:
Present the original Hindi sentence in full. If the input is Romanized Hindi, convert it into correct Devanagari Hindi.

CHINESE:
Provide an accurate, authentic Traditional Chinese translation using Traditional Chinese characters exclusively.

PINYIN:
Provide the complete Hanyu Pinyin with correct tone marks and punctuation.

ROMAN:
Provide the complete Romanized transliteration in Latin script for the Hindi sentence.

EXPLANATION:
Use Hindi throughout to explain the complete meaning, each important word, useful phrases, measure words, word order and overall grammar in detail. Whenever a Chinese word, character, phrase or example is mentioned, include the Traditional Chinese, Pinyin and Hindi meaning together in this format: 漢字 (pīnyīn) - Hindi explanation. Never show Chinese in the explanation without pinyin.

CATEGORY:
Choose exactly one: Daily Life, School, Home, Restaurant, Shopping, Bank, Hospital, Travel, Train & Bus, Airport, Work, Friends, Other

TAGS:
Provide 3 to 6 short English search keywords separated by commas.

Do not add an introduction, conclusion, note or any additional section.

Sentence to be explained:
{{STUDENT_SENTENCE}}`;

const state = {
  sentences: [],
  categories: [],
  selectedCategories: new Set(),
  settings: {},
  preview: null,
  sourceLanguage: 'hi'
};
const $ = (id) => document.getElementById(id);
const sentenceModelAudio = new Audio();
const teacherAudioCache = new Map();
const cardRecordings = new Map();
let activeCardRecorder = null;
let activeCardStream = null;
let activeCardButton = null;
let pendingModelSave = null;
let pendingDeleteSentence = null;
let v3DatabaseReady = false;

function parsePaste(text) {
  const labels = ['SOURCE', 'HINDI', 'TAMIL', 'THAI', 'KHMER', 'VIETNAMESE', 'INDONESIAN', 'NEPALI', 'BENGALI', 'BANGLA', 'SPANISH', 'ENGLISH', 'CHINESE', 'PINYIN', 'ROMANIZATION', 'ROMAN', 'EXPLANATION', 'CATEGORY', 'TAGS', 'AI SOURCE'];
  const found = {};
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?\\s*(${labels.join('|')})\\s*:?\\s*(?:\\*\\*)?\\s*:?\\s*`, 'gi');
  const matches = [...text.matchAll(pattern)];
  matches.forEach((match, index) => {
    const key = match[1].toUpperCase();
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    found[key] = text.slice(start, end).trim();
  });
  const profile = getLanguageProfile(state.sourceLanguage);
  const legacySource = profile.legacyLabels.map(label => found[label]).find(Boolean) || '';
  const sourceSentence = found.SOURCE || legacySource || found.HINDI || found.TAMIL || found.THAI || found.KHMER || found.VIETNAMESE || found.INDONESIAN || found.NEPALI || found.BENGALI || found.BANGLA || found.SPANISH || found.ENGLISH || '';
  const romanization = found.ROMANIZATION || found.ROMAN || '';
  return {
    sourceLanguage: profile.code,
    sourceSentence,
    romanization,
    explanation: found.EXPLANATION || '',
    // V2 compatibility aliases. Remove these after the Firebase migration.
    hindiSentence: sourceSentence, chineseSentence: found.CHINESE || '',
    pinyin: found.PINYIN || '', romanHindi: romanization, hindiExplanation: found.EXPLANATION || '',
    category: found.CATEGORY || 'Other', tags: found.TAGS || '',
    aiSource: found['AI SOURCE'] || 'ChatGPT / Gemini', originalPaste: text
  };
}

function buildPrompt() {
  const sentence = $('promptSentence').value.trim();
  const profile = getLanguageProfile(state.sourceLanguage);
  if (!sentence) {
    $('promptMessage').textContent = `Type one ${profile.name} or Chinese sentence first.`;
    $('promptSentence').focus();
    return '';
  }
  const prompt = buildLanguagePrompt(profile, sentence);
  $('generatedPrompt').value = prompt;
  $('generatedPromptPanel').classList.remove('hidden');
  $('promptMessage').textContent = '';
  $('promptCopyStatus').textContent = '';
  $('generatedPromptPanel').scrollIntoView({behavior:'smooth', block:'nearest'});
  return prompt;
}

function decodeMobileClipboardText(text) {
  let value = String(text || '').trim();
  for (let pass = 0; pass < 3; pass += 1) {
    const encodedBytes = value.match(/%[0-9a-f]{2}/gi) || [];
    if (encodedBytes.length < 3) break;
    try {
      const decoded = decodeURIComponent(value.replace(/\+/g, '%20'));
      if (decoded === value) break;
      value = decoded;
    } catch (_) {
      break;
    }
  }
  return value;
}

async function copyPromptText() {
  const prompt = $('generatedPrompt').value || buildPrompt();
  if (!prompt) return false;
  try {
    await navigator.clipboard.writeText(prompt);
  } catch (_) {
    $('generatedPrompt').focus();
    $('generatedPrompt').select();
    if (!document.execCommand('copy')) {
      $('promptCopyStatus').textContent = 'Select the prompt and copy it manually.';
      return false;
    }
  }
  $('promptCopyStatus').textContent = 'Prompt copied!';
  setTimeout(() => { $('promptCopyStatus').textContent = ''; }, 1800);
  return true;
}

function copyAndOpen(url) {
  const prompt = $('generatedPrompt').value || buildPrompt();
  if (!prompt) return;
  const isMobile = window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    copyPromptText().then(copied => {
      if (copied) window.location.assign(url);
    });
    return;
  }
  const newPage = window.open(url, '_blank', 'noopener,noreferrer');
  copyPromptText();
  if (!newPage) $('promptCopyStatus').textContent = 'Prompt copied. Please allow pop-ups, then open the AI website.';
}

function romanHindiFor(sentence) {
  if (sentence.romanization) return sentence.romanization;
  if (sentence.romanHindi) return sentence.romanHindi;
  if (!sentence.originalPaste) return '';
  return parsePaste(sentence.originalPaste).romanHindi;
}

function sourceSentenceFor(sentence) {
  return sentence.sourceSentence || sentence.hindiSentence || '';
}

function sourceExplanationFor(sentence) {
  return sentence.explanation || sentence.hindiExplanation || '';
}

function sourceLanguageFor(sentence) {
  return sentence.sourceLanguage || 'hi';
}

function applyLanguageProfile(code) {
  const profile = getLanguageProfile(code);
  state.sourceLanguage = profile.code;
  try { localStorage.setItem('csbSourceLanguage', profile.code); } catch (_) {}
  document.documentElement.dataset.sourceLanguage = profile.code;
  $('promptInputLabel').textContent = profile.inputHelp;
  $('promptSentence').placeholder = profile.inputPlaceholder;
  $('generatedPrompt').value = '';
  $('generatedPromptPanel').classList.add('hidden');
  $('promptMessage').textContent = '';
}

function setModelAudioStatus(button, message) {
  const card = button.closest('.sentence-card');
  const status = card && card.querySelector('.card-recording-status');
  if (status) status.textContent = message;
}

function playTeacherAudioUrl(audioUrl, button) {
  sentenceModelAudio.pause();
  sentenceModelAudio.currentTime = 0;
  sentenceModelAudio.src = audioUrl;
  button.classList.add('speaking');
  setModelAudioStatus(button, 'Playing the teacher recording…');
  sentenceModelAudio.onended = () => {
    button.classList.remove('speaking');
    setModelAudioStatus(button, 'Teacher recording finished.');
  };
  sentenceModelAudio.onerror = () => {
    button.classList.remove('speaking');
    setModelAudioStatus(button, 'The teacher recording could not be played.');
  };
  sentenceModelAudio.play().catch(() => {
    button.classList.remove('speaking');
    setModelAudioStatus(button, 'Tap the play button again to hear the teacher recording.');
  });
}

function playSentenceModel(sentence, button) {
  if (!sentence.standardAudioUrl) {
    speakChinese(sentence.chineseSentence, button);
    return;
  }

  const cachedUrl = teacherAudioCache.get(sentence.recordId);
  if (cachedUrl) {
    playTeacherAudioUrl(cachedUrl, button);
    return;
  }

  button.disabled = true;
  setModelAudioStatus(button, 'Loading the teacher recording…');
  const callback = `receiveTeacherAudio${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const script = document.createElement('script');
  const cleanup = () => {
    delete window[callback];
    script.remove();
    button.disabled = false;
  };

  window[callback] = data => {
    cleanup();
    if (!data || !data.success || !data.audioBase64) {
      setModelAudioStatus(button, `Teacher recording unavailable: ${(data && data.message) || 'unknown error'}`);
      return;
    }
    try {
      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const audioUrl = URL.createObjectURL(new Blob([bytes], {type:data.mimeType || 'audio/webm'}));
      teacherAudioCache.set(sentence.recordId, audioUrl);
      playTeacherAudioUrl(audioUrl, button);
    } catch (_) {
      setModelAudioStatus(button, 'The teacher recording was received but could not be decoded.');
    }
  };
  script.onerror = () => {
    cleanup();
    setModelAudioStatus(button, 'Could not load the teacher recording. Please check the newest Apps Script deployment.');
  };
  script.src = `${API_URL}?action=audio&recordId=${encodeURIComponent(sentence.recordId)}&callback=${callback}&_=${Date.now()}`;
  document.body.appendChild(script);
}

async function getNaturalVoiceStream() {
  const supported = navigator.mediaDevices.getSupportedConstraints
    ? navigator.mediaDevices.getSupportedConstraints()
    : {};
  const audio = {};
  ['autoGainControl', 'echoCancellation', 'noiseSuppression'].forEach(name => {
    if (supported[name]) audio[name] = {exact:false};
  });
  if (supported.channelCount) audio.channelCount = {ideal:1};
  if (supported.sampleRate) audio.sampleRate = {ideal:48000};
  if (supported.sampleSize) audio.sampleSize = {ideal:16};

  try {
    return await navigator.mediaDevices.getUserMedia({audio});
  } catch (error) {
    if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) throw error;
    ['autoGainControl', 'echoCancellation', 'noiseSuppression'].forEach(name => {
      if (supported[name]) audio[name] = {ideal:false};
    });
    return navigator.mediaDevices.getUserMedia({audio});
  }
}

function createVoiceRecorder(stream) {
  try {
    return new MediaRecorder(stream, {audioBitsPerSecond:128000});
  } catch (_) {
    return new MediaRecorder(stream);
  }
}

async function toggleCardRecording(node, sentence, preview) {
  const recordButton = node.querySelector('.card-record-button');
  const playButton = node.querySelector('.card-play-button');
  const saveButton = node.querySelector('.card-save-model-button');
  const status = node.querySelector('.card-recording-status');

  if (activeCardRecorder && activeCardRecorder.state === 'recording') {
    if (activeCardButton !== recordButton) {
      status.textContent = 'Another card is recording. Stop it first.';
      return;
    }
    activeCardRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices || !window.MediaRecorder) {
    status.textContent = 'Recording is not supported here. Try Chrome, Edge, or Safari.';
    return;
  }

  try {
    const stream = await getNaturalVoiceStream();
    const chunks = [];
    const recorder = createVoiceRecorder(stream);
    activeCardRecorder = recorder;
    activeCardStream = stream;
    activeCardButton = recordButton;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(chunks, {type:recorder.mimeType || 'audio/webm'});
      const key = sentence.recordId || `preview-${sentence.chineseSentence}`;
      const previous = cardRecordings.get(key);
      if (previous && previous.url) URL.revokeObjectURL(previous.url);
      const recording = {blob, url:URL.createObjectURL(blob), mimeType:blob.type || 'audio/webm'};
      cardRecordings.set(key, recording);
      playButton.disabled = false;
      // Personal model recordings will be enabled in the Firebase Storage phase.
      saveButton.disabled = true;
      recordButton.classList.remove('recording');
      recordButton.textContent = '● Record again';
      status.textContent = preview ? 'Recording ready. Save the sentence before saving a model voice.' : 'Recording ready. Listen and compare.';
      activeCardRecorder = null;
      activeCardStream = null;
      activeCardButton = null;
    };
    recorder.start();
    recordButton.classList.add('recording');
    recordButton.textContent = '■ Stop recording';
    status.textContent = 'Recording… Automatic volume control is off. Keep a steady distance from the microphone.';
    setTimeout(() => {
      if (activeCardRecorder === recorder && recorder.state === 'recording') recorder.stop();
    }, 30000);
  } catch (_) {
    status.textContent = 'Microphone permission was not allowed.';
  }
}

function recordingForSentence(sentence) {
  return cardRecordings.get(sentence.recordId || `preview-${sentence.chineseSentence}`);
}

function openAudioPinDialog(sentence, node) {
  const recording = recordingForSentence(sentence);
  if (!recording || !sentence.recordId) return;
  pendingModelSave = {sentence, node, recording};
  try { $('audioPinInput').value = localStorage.getItem('csbSubmissionPin') || ''; } catch (_) {}
  $('audioSaveMessage').textContent = '';
  $('audioPinDialog').showModal();
  setTimeout(() => $('audioPinInput').focus(), 50);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function submitTeacherAudio() {
  const pin = $('audioPinInput').value.trim();
  if (!pin) { $('audioSaveMessage').textContent = 'Enter the teacher PIN.'; return; }
  if (!pendingModelSave) { $('audioPinDialog').close(); return; }
  const {sentence, recording} = pendingModelSave;
  const button = $('confirmAudioSave');
  button.disabled = true;
  $('audioSaveMessage').textContent = 'Uploading the teacher recording…';

  try {
    const audioData = await blobToBase64(recording.blob);
    const requestId = `audio-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
    const form = document.createElement('form');
    form.method = 'POST'; form.action = API_URL; form.target = 'submissionFrame'; form.hidden = true;
    const fields = {action:'saveAudio', requestId, pin, recordId:sentence.recordId, mimeType:recording.mimeType, audioData};
    Object.entries(fields).forEach(([name,value]) => {
      const field = name === 'audioData' ? document.createElement('textarea') : document.createElement('input');
      field.name = name; field.value = value; form.appendChild(field);
    });
    document.body.appendChild(form); form.submit(); form.remove();
    try { localStorage.setItem('csbSubmissionPin', pin); } catch (_) {}

    let checks = 0;
    const verify = setInterval(() => {
      checks += 1;
      const callback = `verifyAudioStatus${Date.now()}`;
      const script = document.createElement('script');
      window[callback] = data => {
        delete window[callback]; script.remove();
        if (data && data.success && data.standardAudioUrl) {
          clearInterval(verify);
          const saved = state.sentences.find(row => row.recordId === sentence.recordId);
          if (saved) saved.standardAudioUrl = data.standardAudioUrl;
          renderSentences();
          $('audioSaveMessage').textContent = 'Teacher recording saved! The model button now uses your voice.';
          button.disabled = false;
          setTimeout(() => $('audioPinDialog').close(), 1300);
        } else if (data && data.success === false) {
          clearInterval(verify);
          button.disabled = false;
          $('audioSaveMessage').textContent = `Save failed: ${data.error || 'Unknown backend error.'}`;
        } else if (checks >= 20) {
          clearInterval(verify);
          button.disabled = false;
          $('audioSaveMessage').textContent = 'No confirmation was received. Please check that the newest BankApi.gs was deployed.';
        }
      };
      script.onerror = () => { delete window[callback]; script.remove(); };
      script.src = `${API_URL}?action=uploadStatus&requestId=${encodeURIComponent(requestId)}&callback=${callback}&_=${Date.now()}`;
      document.body.appendChild(script);
    }, 1500);
  } catch (_) {
    button.disabled = false;
    $('audioSaveMessage').textContent = 'The recording could not be prepared. Please record again.';
  }
}

function openDeleteDialog(sentence) {
  if (!sentence.recordId) return;
  pendingDeleteSentence = sentence;
  $('deleteSentenceText').textContent = sentence.chineseSentence || sentence.hindiSentence || 'Untitled sentence';
  $('deleteRecordId').textContent = sentence.recordId;
  $('deleteMessage').textContent = '';
  $('confirmDelete').disabled = false;
  $('deleteDialog').showModal();
}

async function submitDeleteSentence() {
  if (!pendingDeleteSentence) { $('deleteDialog').close(); return; }
  const sentence = pendingDeleteSentence;
  const button = $('confirmDelete');
  button.disabled = true;
  $('deleteMessage').textContent = 'Deleting sentence…';
  try {
    if (!window.MCSB_DB) throw new Error('The V3 database is not ready. Refresh and try again.');
    await window.MCSB_DB.deleteSentence(sentence.recordId);
    pendingDeleteSentence = null;
    $('deleteMessage').textContent = 'Sentence deleted.';
    setTimeout(() => $('deleteDialog').close(), 650);
  } catch (error) {
    button.disabled = false;
    $('deleteMessage').textContent = `Delete failed: ${error.message || 'Unknown error.'}`;
  }
}

function createCard(sentence, preview = false) {
  const profile = getLanguageProfile(sourceLanguageFor(sentence));
  const node = $('cardTemplate').content.firstElementChild.cloneNode(true);
  node.querySelector('.category-pill').textContent = sentence.category || 'Other';
  node.querySelector('.record-id').textContent = preview ? 'PREVIEW' : sentence.recordId || '';
  const deleteButton = node.querySelector('.card-delete-button');
  deleteButton.hidden = preview;
  if (!preview) deleteButton.addEventListener('click', () => openDeleteDialog(sentence));
  const sourceSentence = sourceSentenceFor(sentence);
  node.querySelector('.hindi').textContent = sourceSentence;
  const hindiSpeak = node.querySelector('.hindi-speak-button');
  hindiSpeak.title = `Play ${profile.name} pronunciation`;
  hindiSpeak.addEventListener('click', () => speakSourceLanguage(sourceSentence, profile.locale, hindiSpeak));
  const roman = romanHindiFor(sentence);
  const romanLine = node.querySelector('.roman-hindi');
  romanLine.textContent = roman ? `${profile.romanizationName}: ${roman}` : '';
  romanLine.hidden = !roman;
  node.querySelector('.chinese').textContent = sentence.chineseSentence;
  node.querySelector('.pinyin').textContent = sentence.pinyin;
  node.querySelector('.explanation-label').textContent = `${profile.name} explanation`;
  node.querySelector('.explanation').textContent = sourceExplanationFor(sentence) || 'No explanation added.';
  const tags = String(sentence.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  node.querySelector('.tags').innerHTML = tags.map(tag => `<span class="tag"></span>`).join('');
  node.querySelectorAll('.tag').forEach((el, i) => { el.textContent = tags[i]; });
  const speak = node.querySelector('.speak-button');
  speak.title = sentence.standardAudioUrl ? 'Play teacher model voice' : 'Play browser voice';
  speak.addEventListener('click', () => playSentenceModel(sentence, speak));
  const recordButton = node.querySelector('.card-record-button');
  const playButton = node.querySelector('.card-play-button');
  const saveModelButton = node.querySelector('.card-save-model-button');
  recordButton.addEventListener('click', () => toggleCardRecording(node, sentence, preview));
  playButton.addEventListener('click', () => {
    const recording = recordingForSentence(sentence);
    if (recording) new Audio(recording.url).play();
  });
  saveModelButton.addEventListener('click', () => openAudioPinDialog(sentence, node));
  return node;
}

function speakChinese(text, button) {
  if (!('speechSynthesis' in window)) return alert('Speech is not supported in this browser. Please try Chrome, Edge or Safari.');
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = state.settings.defaultVoice || 'zh-TW';
  utterance.rate = Number(state.settings.speechRate) || 0.85;
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find(v => v.lang.toLowerCase() === 'zh-tw') || voices.find(v => v.lang.toLowerCase().startsWith('zh')) || null;
  utterance.onstart = () => button.classList.add('speaking');
  utterance.onend = utterance.onerror = () => button.classList.remove('speaking');
  speechSynthesis.speak(utterance);
}

function speakHindi(text, button) {
  return speakSourceLanguage(text, 'hi-IN', button);
}

function speakSourceLanguage(text, locale, button) {
  if (!('speechSynthesis' in window)) return alert('Speech is not supported in this browser. Please try Chrome, Edge or Safari.');
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  utterance.rate = 0.85;
  const voices = speechSynthesis.getVoices();
  const normalizedLocale = locale.toLowerCase();
  const languageCode = normalizedLocale.split('-')[0];
  utterance.voice = voices.find(v => v.lang.toLowerCase() === normalizedLocale) || voices.find(v => v.lang.toLowerCase().startsWith(languageCode)) || null;
  utterance.onstart = () => button.classList.add('speaking');
  utterance.onend = utterance.onerror = () => button.classList.remove('speaking');
  speechSynthesis.speak(utterance);
}

/* Pronunciation Lab: listening, recording, pitch direction and homophones. */
const toneModels = {
  1: { text:'媽', curve:[0.78,0.79,0.78,0.79,0.78] },
  2: { text:'麻', curve:[0.28,0.36,0.49,0.65,0.82] },
  3: { text:'馬', curve:[0.55,0.36,0.24,0.38,0.68] },
  4: { text:'罵', curve:[0.84,0.67,0.49,0.31,0.17] }
};

const homophoneFamilies = {
  shi4: [
    {char:'是',pinyin:'shì',meaning:'to be / होना',word:'是的',wordPinyin:'shì de',wordMeaning:'yes'},
    {char:'事',pinyin:'shì',meaning:'matter / बात',word:'事情',wordPinyin:'shìqing',wordMeaning:'matter; event'},
    {char:'市',pinyin:'shì',meaning:'city; market / शहर; बाज़ार',word:'市場',wordPinyin:'shìchǎng',wordMeaning:'market'},
    {char:'室',pinyin:'shì',meaning:'room / कमरा',word:'教室',wordPinyin:'jiàoshì',wordMeaning:'classroom'},
    {char:'試',pinyin:'shì',meaning:'test; try / परीक्षा; कोशिश',word:'考試',wordPinyin:'kǎoshì',wordMeaning:'exam'},
    {char:'式',pinyin:'shì',meaning:'style; form / प्रकार',word:'方式',wordPinyin:'fāngshì',wordMeaning:'method'},
    {char:'世',pinyin:'shì',meaning:'world; generation / संसार',word:'世界',wordPinyin:'shìjiè',wordMeaning:'world'},
    {char:'視',pinyin:'shì',meaning:'look; vision / दृष्टि',word:'電視',wordPinyin:'diànshì',wordMeaning:'television'}
  ],
  yi4: [
    {char:'意',pinyin:'yì',meaning:'meaning; idea / अर्थ; विचार',word:'意思',wordPinyin:'yìsi',wordMeaning:'meaning'},
    {char:'易',pinyin:'yì',meaning:'easy; change / आसान; बदलना',word:'容易',wordPinyin:'róngyì',wordMeaning:'easy'},
    {char:'義',pinyin:'yì',meaning:'justice; meaning / न्याय; अर्थ',word:'意義',wordPinyin:'yìyì',wordMeaning:'significance'},
    {char:'藝',pinyin:'yì',meaning:'art; skill / कला',word:'藝術',wordPinyin:'yìshù',wordMeaning:'art'},
    {char:'議',pinyin:'yì',meaning:'discuss / चर्चा',word:'建議',wordPinyin:'jiànyì',wordMeaning:'suggestion'},
    {char:'憶',pinyin:'yì',meaning:'remember / स्मरण',word:'回憶',wordPinyin:'huíyì',wordMeaning:'memory'},
    {char:'異',pinyin:'yì',meaning:'different / अलग',word:'差異',wordPinyin:'chāyì',wordMeaning:'difference'},
    {char:'億',pinyin:'yì',meaning:'one hundred million / दस करोड़',word:'一億',wordPinyin:'yí yì',wordMeaning:'100 million'}
  ],
  gong1: [
    {char:'工',pinyin:'gōng',meaning:'work / काम',word:'工作',wordPinyin:'gōngzuò',wordMeaning:'work'},
    {char:'公',pinyin:'gōng',meaning:'public / सार्वजनिक',word:'公園',wordPinyin:'gōngyuán',wordMeaning:'park'},
    {char:'功',pinyin:'gōng',meaning:'achievement / उपलब्धि',word:'成功',wordPinyin:'chénggōng',wordMeaning:'succeed'},
    {char:'宮',pinyin:'gōng',meaning:'palace / महल',word:'故宮',wordPinyin:'Gùgōng',wordMeaning:'Palace Museum'},
    {char:'供',pinyin:'gōng',meaning:'provide / प्रदान करना',word:'提供',wordPinyin:'tígōng',wordMeaning:'provide'},
    {char:'攻',pinyin:'gōng',meaning:'attack / हमला',word:'攻擊',wordPinyin:'gōngjí',wordMeaning:'attack'},
    {char:'弓',pinyin:'gōng',meaning:'bow / धनुष',word:'弓箭',wordPinyin:'gōngjiàn',wordMeaning:'bow and arrow'},
    {char:'恭',pinyin:'gōng',meaning:'respectful / आदरपूर्ण',word:'恭喜',wordPinyin:'gōngxǐ',wordMeaning:'congratulations'}
  ]
};

const contextQuestions = [
  {sentence:'我＿＿學生。',pinyin:'Wǒ shì xuéshēng.',options:['是','事','市','試'],answer:'是',explain:'是 (shì) means “to be”: I am a student.'},
  {sentence:'我明天要考＿＿。',pinyin:'Wǒ míngtiān yào kǎoshì.',options:['室','試','市','事'],answer:'試',explain:'考試 (kǎoshì) is the complete word for “exam”.'},
  {sentence:'老師在教＿＿。',pinyin:'Lǎoshī zài jiàoshì.',options:['是','世','室','視'],answer:'室',explain:'教室 (jiàoshì) means “classroom”.'},
  {sentence:'這個字是什麼＿＿思？',pinyin:'Zhège zì shì shénme yìsi?',options:['意','易','藝','議'],answer:'意',explain:'意思 (yìsi) means “meaning”.'},
  {sentence:'謝謝你的建＿＿。',pinyin:'Xièxie nǐ de jiànyì.',options:['憶','議','義','億'],answer:'議',explain:'建議 (jiànyì) means “suggestion”.'},
  {sentence:'他在銀行＿＿作。',pinyin:'Tā zài yínháng gōngzuò.',options:['工','公','功','宮'],answer:'工',explain:'工作 (gōngzuò) means “work”.'}
];

let recorder = null;
let recordedChunks = [];
let recordedUrl = '';
let quizIndex = 0;
const standardToneAudio = new Audio();
let activeToneButton = null;

function speakLabText(text, button) {
  const original = button && button.textContent;
  speakChinese(text, button || document.createElement('button'));
  if (button) {
    button.textContent = '♪ Playing';
    setTimeout(() => { button.textContent = original; }, 1200);
  }
}

function resetToneAudioButton() {
  if (!activeToneButton) return;
  activeToneButton.textContent = activeToneButton.dataset.label;
  activeToneButton.classList.remove('playing');
  activeToneButton = null;
}

function playStandardTone(src, button, fallbackText) {
  standardToneAudio.pause();
  standardToneAudio.currentTime = 0;
  resetToneAudioButton();
  if (!button.dataset.label) button.dataset.label = button.textContent;
  activeToneButton = button;
  button.textContent = '♪ Playing';
  button.classList.add('playing');
  standardToneAudio.src = src;
  standardToneAudio.play().catch(() => {
    resetToneAudioButton();
    speakLabText(fallbackText, button);
  });
}

standardToneAudio.addEventListener('ended', resetToneAudioButton);
standardToneAudio.addEventListener('error', resetToneAudioButton);

function showLabPanel(panel) {
  const tone = panel === 'tone';
  $('tonePractice').classList.toggle('hidden', !tone);
  $('homophonePractice').classList.toggle('hidden', tone);
  $('toneTab').classList.toggle('active', tone);
  $('homophoneTab').classList.toggle('active', !tone);
  $('toneTab').setAttribute('aria-selected', String(tone));
  $('homophoneTab').setAttribute('aria-selected', String(!tone));
}

function drawPitch(reference, student = []) {
  const canvas = $('pitchCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, pad = 30;
  ctx.clearRect(0,0,w,h); ctx.fillStyle = '#fffaf2'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = '#dedbd2'; ctx.lineWidth = 1;
  for (let i=1;i<5;i++) { const y=pad+(h-pad*2)*i/5; ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke(); }
  const line = (values,color,width) => {
    if (!values.length) return;
    ctx.strokeStyle=color; ctx.lineWidth=width; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath();
    values.forEach((v,i) => { const x=pad+(w-pad*2)*(i/(values.length-1||1)); const y=h-pad-v*(h-pad*2); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.stroke();
  };
  line(reference,'#0b706b',7); line(student,'#d94a36',4);
}

function autocorrelate(buffer, sampleRate) {
  let rms=0; for (let i=0;i<buffer.length;i++) rms+=buffer[i]*buffer[i]; rms=Math.sqrt(rms/buffer.length);
  if (rms < 0.012) return -1;
  let bestOffset=-1, bestCorrelation=0;
  const minOffset=Math.floor(sampleRate/450), maxOffset=Math.min(Math.floor(sampleRate/70),buffer.length-1);
  for (let offset=minOffset;offset<=maxOffset;offset++) {
    let corr=0; for (let i=0;i<buffer.length-offset;i++) corr+=buffer[i]*buffer[i+offset];
    corr/=buffer.length-offset;
    if (corr>bestCorrelation) { bestCorrelation=corr; bestOffset=offset; }
  }
  return bestCorrelation>0.005 ? sampleRate/bestOffset : -1;
}

async function analyseRecording(blob) {
  const data = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await audioCtx.decodeAudioData(data.slice(0));
  const samples = audio.getChannelData(0), windowSize=2048, step=Math.max(512,Math.floor(samples.length/60));
  const pitches=[];
  for (let start=0;start+windowSize<samples.length;start+=step) {
    const pitch=autocorrelate(samples.subarray(start,start+windowSize),audio.sampleRate);
    if (pitch>70&&pitch<450) pitches.push(pitch);
  }
  await audioCtx.close();
  if (pitches.length<3) throw new Error('Not enough clear voice was detected.');
  const sorted=[...pitches].sort((a,b)=>a-b), low=sorted[Math.floor(sorted.length*.1)], high=sorted[Math.floor(sorted.length*.9)];
  const span=Math.max(20,high-low), normalized=pitches.map(v=>Math.max(.05,Math.min(.95,(v-low)/span)));
  const smoothed=normalized.map((v,i,a)=>a.slice(Math.max(0,i-2),i+3).reduce((s,n)=>s+n,0)/a.slice(Math.max(0,i-2),i+3).length);
  drawPitch(toneModels[$('practiceTone').value].curve,smoothed);
}

async function toggleRecording() {
  if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    $('recordingStatus').textContent='Recording is not supported here. Try Chrome or Safari.'; return;
  }
  try {
    const stream=await getNaturalVoiceStream();
    recordedChunks=[]; recorder=createVoiceRecorder(stream);
    recorder.ondataavailable=e=>{if(e.data.size) recordedChunks.push(e.data);};
    recorder.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(recordedChunks,{type:recorder.mimeType||'audio/webm'});
      if(recordedUrl) URL.revokeObjectURL(recordedUrl); recordedUrl=URL.createObjectURL(blob);
      $('recordedAudio').src=recordedUrl; $('playRecording').disabled=false;
      $('recordTone').classList.remove('recording'); $('recordTone').textContent='● Start recording';
      $('recordingStatus').textContent='Recording ready. Compare the two lines.';
      try { await analyseRecording(blob); } catch(e) { $('recordingStatus').textContent=e.message+' Try again in a quiet place.'; }
    };
    recorder.start(); $('recordTone').classList.add('recording'); $('recordTone').textContent='■ Stop recording';
    $('recordingStatus').textContent='Recording… Automatic volume control is off. Say the syllable for about one second.';
    setTimeout(()=>{if(recorder&&recorder.state==='recording')recorder.stop();},3500);
  } catch (_) { $('recordingStatus').textContent='Microphone permission was not allowed. Please allow it and try again.'; }
}

function renderHomophones(key='shi4') {
  const mount=$('homophoneGrid'); mount.innerHTML='';
  homophoneFamilies[key].forEach(item=>{
    const card=document.createElement('article'); card.className='homophone-card';
    const top=document.createElement('div'); top.className='homophone-top';
    const char=document.createElement('span'); char.className='homophone-character'; char.textContent=item.char;
    const play=document.createElement('button'); play.type='button'; play.className='homophone-speak'; play.textContent='▶'; play.setAttribute('aria-label',`Listen to ${item.word}`); play.addEventListener('click',()=>speakLabText(item.word,play));
    top.append(char,play); card.append(top);
    const py=document.createElement('strong'); py.textContent=item.pinyin; card.append(py);
    const meaning=document.createElement('small'); meaning.textContent=item.meaning; card.append(meaning);
    const word=document.createElement('p'); word.className='homophone-word'; word.textContent=`${item.word} · ${item.wordPinyin}`; card.append(word);
    const wordMeaning=document.createElement('small'); wordMeaning.textContent=item.wordMeaning; card.append(wordMeaning); mount.append(card);
  });
}

function renderQuiz() {
  const q=contextQuestions[quizIndex%contextQuestions.length]; $('quizQuestion').textContent=q.sentence; $('quizPinyin').textContent=q.pinyin;
  $('quizFeedback').textContent=''; const mount=$('quizOptions'); mount.innerHTML='';
  q.options.forEach(option=>{const b=document.createElement('button');b.type='button';b.textContent=option;b.addEventListener('click',()=>{
    mount.querySelectorAll('button').forEach(x=>x.disabled=true); b.classList.add(option===q.answer?'correct':'wrong');
    if(option!==q.answer)[...mount.children].find(x=>x.textContent===q.answer)?.classList.add('correct');
    $('quizFeedback').textContent=option===q.answer?`Correct. ${q.explain}`:`Try to read the complete word. ${q.explain}`;
    speakLabText(q.sentence.replace('＿＿',q.answer),document.createElement('button'));
  });mount.append(b);});
}

function initPronunciationLab() {
  if (!$('pronunciationLab')) return;
  $('toneTab').addEventListener('click',()=>showLabPanel('tone'));
  $('homophoneTab').addEventListener('click',()=>showLabPanel('homophone'));
  document.querySelectorAll('.tone-card').forEach(card=>card.querySelectorAll('.tone-audio').forEach(button=>button.addEventListener('click',()=>playStandardTone(button.dataset.audio,button,card.dataset.text))));
  $('practiceTone').addEventListener('change',()=>drawPitch(toneModels[$('practiceTone').value].curve));
  $('hearPracticeTone').addEventListener('click',e=>{const tone=$('practiceTone').value;playStandardTone(`audio/tones/ma-tone-${tone}-once.mp3`,e.currentTarget,toneModels[tone].text);});
  $('recordTone').addEventListener('click',toggleRecording);
  $('playRecording').addEventListener('click',()=>$('recordedAudio').play());
  document.querySelectorAll('.sound-chip').forEach(chip=>chip.addEventListener('click',()=>{document.querySelectorAll('.sound-chip').forEach(c=>c.classList.remove('active'));chip.classList.add('active');renderHomophones(chip.dataset.sound);}));
  $('nextQuiz').addEventListener('click',()=>{quizIndex++;renderQuiz();});
  drawPitch(toneModels[1].curve); renderHomophones(); renderQuiz();
}

function renderFilters() {
  const mount = $('topicOptions');
  mount.innerHTML = '';
  state.selectedCategories = new Set(state.categories.map(normalizeSearchText));
  state.categories.forEach((category, index) => {
    const label = document.createElement('label');
    label.className = 'topic-option';
    label.innerHTML = `<input type="checkbox" value=""><span class="check-circle" aria-hidden="true"></span><span class="topic-name"></span>`;
    const input = label.querySelector('input');
    input.value = category;
    input.checked = true;
    input.id = `topic-${index}`;
    label.querySelector('.topic-name').textContent = category;
    input.addEventListener('change', () => {
      const key = normalizeSearchText(category);
      if (input.checked) state.selectedCategories.add(key);
      else state.selectedCategories.delete(key);
      updateTopicPicker();
      renderSentences();
    });
    mount.appendChild(label);
  });
  updateTopicPicker();
}

function normalizeSearchText(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function sentenceTopics(sentence) {
  const known = new Set(state.categories.map(normalizeSearchText));
  const values = [sentence.category].concat(String(sentence.tags || '').split(/[,;|]/));
  return new Set(values.map(normalizeSearchText).filter(value => known.has(value)));
}

function matchesKeywordExpression(haystack) {
  const terms = ['keywordA', 'keywordB', 'keywordC'].map(id => normalizeSearchText($(id).value));
  const operations = [$('operatorAB').value, $('operatorBC').value];
  let result = null;
  terms.forEach((term, index) => {
    if (!term) return;
    const found = haystack.includes(term);
    if (result === null) result = found;
    else result = operations[index - 1] === 'OR' ? result || found : result && found;
  });
  return result === null ? true : result;
}

function updateTopicPicker() {
  const total = state.categories.length;
  const selected = state.selectedCategories.size;
  const all = $('topicAll');
  all.checked = total > 0 && selected === total;
  all.indeterminate = selected > 0 && selected < total;
  $('topicSummary').textContent = selected === total ? 'All topics' : selected === 0 ? 'Any topic' : `${selected} topics selected`;
}

function renderSentences() {
  const visible = state.sentences.filter(s => {
    const haystack = normalizeSearchText([s.recordId,sourceSentenceFor(s),romanHindiFor(s),s.chineseSentence,s.pinyin,sourceExplanationFor(s),s.category,s.tags].join(' '));
    const topicMatch = state.selectedCategories.size === 0 || [...sentenceTopics(s)].some(topic => state.selectedCategories.has(topic));
    return matchesKeywordExpression(haystack) && topicMatch;
  });
  const grid = $('sentenceGrid'); grid.innerHTML = '';
  visible.forEach(s => grid.appendChild(createCard(s)));
  $('resultCount').textContent = `${visible.length} shown`;
  $('emptyState').classList.toggle('hidden', visible.length > 0);
}

function handlePreview() {
  const pastedText = $('pasteInput').value.trim();
  const text = decodeMobileClipboardText(pastedText);
  if (!text) { $('parseMessage').textContent = 'Paste an AI answer first.'; return; }
  if (text !== pastedText) $('pasteInput').value = text;
  const parsed = parsePaste(text);
  const profile = getLanguageProfile(parsed.sourceLanguage);
  const required = [['Source', parsed.sourceSentence], ['Chinese', parsed.chineseSentence], ['Pinyin', parsed.pinyin], ['Explanation', parsed.explanation]];
  if (profile.requiresRomanization) required.splice(3, 0, ['Romanization', parsed.romanization]);
  const missing = required.filter(([,value]) => !value).map(([label]) => label);
  if (missing.length) { $('parseMessage').textContent = `Please add these labelled parts: ${missing.join(', ')}.`; return; }
  state.preview = parsed; $('parseMessage').textContent = '';
  const mount = $('previewCard'); mount.innerHTML = ''; mount.appendChild(createCard(parsed, true));
  $('previewPanel').classList.remove('hidden'); $('previewPanel').scrollIntoView({behavior:'smooth',block:'start'});
  updateV3SaveControls();
}

function updateV3SaveControls() {
  const user = window.MCSB_AUTH && window.MCSB_AUTH.user;
  const ready = Boolean(v3DatabaseReady && window.MCSB_DB);
  const button = $('saveButton');
  button.disabled = !(state.preview && user && ready);
  if (!user) button.textContent = 'Sign in to save';
  else if (!ready) button.textContent = 'Connecting database…';
  else button.textContent = 'Save to my personal bank';
}

async function savePreviewToV3() {
  if (!state.preview) return;
  const button = $('saveButton');
  button.disabled = true;
  $('v3SaveMessage').textContent = 'Saving to your personal bank…';
  try {
    await window.MCSB_DB.saveSentence(state.preview);
    state.preview = null;
    $('pasteInput').value = '';
    $('previewPanel').classList.add('hidden');
    $('v3SaveMessage').textContent = '';
    $('libraryTitle').scrollIntoView({behavior:'smooth'});
  } catch (error) {
    $('v3SaveMessage').textContent = `Save failed: ${error.message || 'Unknown error.'}`;
  } finally {
    updateV3SaveControls();
  }
}

function showEmptyV3Bank(user = null) {
  window.__sentenceBankLoaded = true;
  state.sentences = [];
  state.categories = [];
  state.selectedCategories = new Set();
  state.settings = {};
  teacherAudioCache.clear();

  $('bankName').textContent = 'My Chinese Sentence Bank';
  $('ownerName').textContent = user
    ? `Teacher workspace · ${user.displayName || user.email || 'Signed in'}`
    : 'A personal language notebook';
  document.title = 'My Chinese Sentence Bank';
  $('sentenceCount').textContent = '0';
  $('categoryCount').textContent = '0';
  $('apiStatus').className = user ? 'live-status ready' : 'live-status';
  $('apiStatus').innerHTML = user
    ? '<i></i> Personal V3 bank ready'
    : '<i></i> Sign in to open your bank';
  renderFilters();
  renderSentences();
}

function handleV3AuthChange(event) {
  const authState = event.detail || window.MCSB_AUTH || {};
  showEmptyV3Bank(authState.user || null);
  updateV3SaveControls();
}

function receiveV3Bank(event) {
  const detail = event.detail || {};
  const user = detail.user || null;
  const sentences = Array.isArray(detail.sentences) ? detail.sentences : [];
  if (!user) {
    showEmptyV3Bank(null);
    return;
  }
  state.sentences = sentences;
  state.categories = [...new Set(sentences.map(row => String(row.category || '').trim()).filter(Boolean))].sort();
  state.selectedCategories = new Set(state.categories.map(normalizeSearchText));
  state.settings = { defaultVoice: 'zh-TW', speechRate: 0.85 };
  $('ownerName').textContent = `Teacher workspace · ${user.displayName || user.email || 'Signed in'}`;
  $('sentenceCount').textContent = String(sentences.length);
  $('categoryCount').textContent = String(state.categories.length);
  $('apiStatus').className = 'live-status ready';
  $('apiStatus').innerHTML = '<i></i> Firestore connected';
  renderFilters();
  renderSentences();
  updateV3SaveControls();
}

function showV3BankError(event) {
  const message = (event.detail && event.detail.message) || 'Could not open your personal bank.';
  $('apiStatus').className = 'live-status error';
  $('apiStatus').innerHTML = '<i></i> Firestore connection problem';
  $('sentenceGrid').innerHTML = `<div class="loading-card">${message}</div>`;
}

$('startButton').addEventListener('click', () => $('createPrompt').scrollIntoView({behavior:'smooth'}));
$('refreshButton').addEventListener('click', () => {
  $('refreshButton').disabled = true;
  $('refreshButton').textContent = '…';
  window.location.reload();
});
$('generatePrompt').addEventListener('click', buildPrompt);
$('sourceLanguage').addEventListener('change', event => applyLanguageProfile(event.target.value));
$('clearPrompt').addEventListener('click', () => {
  $('promptSentence').value = '';
  $('generatedPrompt').value = '';
  $('generatedPromptPanel').classList.add('hidden');
  $('promptMessage').textContent = '';
  $('promptCopyStatus').textContent = '';
  $('promptSentence').focus();
});
$('promptSentence').addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') buildPrompt();
});
$('copyGeneratedPrompt').addEventListener('click', copyPromptText);
$('openChatGPT').addEventListener('click', () => copyAndOpen('https://chatgpt.com/'));
$('openGemini').addEventListener('click', () => copyAndOpen('https://gemini.google.com/app'));
$('sampleButton').addEventListener('click', () => { $('pasteInput').value = SAMPLE; $('pasteInput').focus(); });
$('pasteInput').addEventListener('paste', () => {
  setTimeout(() => {
    const pastedText = $('pasteInput').value;
    const decoded = decodeMobileClipboardText(pastedText);
    if (decoded !== pastedText.trim()) {
      $('pasteInput').value = decoded;
      $('parseMessage').textContent = 'Mobile encoded text was decoded automatically. You can preview it now.';
    }
  }, 0);
});
$('clearButton').addEventListener('click', () => { $('pasteInput').value = ''; $('parseMessage').textContent = ''; $('previewPanel').classList.add('hidden'); });
$('previewButton').addEventListener('click', handlePreview);
['keywordA','keywordB','keywordC'].forEach(id => $(id).addEventListener('input', renderSentences));
['operatorAB','operatorBC'].forEach(id => $(id).addEventListener('change', renderSentences));
$('topicToggle').addEventListener('click', () => {
  const open = !$('topicMenu').classList.contains('hidden');
  $('topicMenu').classList.toggle('hidden', open);
  $('topicToggle').setAttribute('aria-expanded', String(!open));
});
$('topicAll').addEventListener('change', () => {
  const shouldSelectAll = $('topicAll').checked;
  state.selectedCategories = new Set(shouldSelectAll ? state.categories.map(normalizeSearchText) : []);
  $('topicOptions').querySelectorAll('input').forEach(input => { input.checked = shouldSelectAll; });
  updateTopicPicker(); renderSentences();
});
document.addEventListener('click', event => {
  if (!$('topicPicker').contains(event.target)) {
    $('topicMenu').classList.add('hidden');
    $('topicToggle').setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    $('topicMenu').classList.add('hidden');
    $('topicToggle').setAttribute('aria-expanded', 'false');
  }
});
$('helpButton').addEventListener('click', () => $('helpDialog').showModal());
$('copyPrompt').addEventListener('click', async () => {
  const profile = getLanguageProfile(state.sourceLanguage);
  await navigator.clipboard.writeText(buildLanguagePrompt(profile, `[Paste one ${profile.name} or Chinese sentence here]`));
  const button = $('copyPrompt'); button.textContent = 'Copied!';
  setTimeout(() => { button.textContent = 'Copy AI prompt'; }, 1400);
});
$('closeHelp').addEventListener('click', () => $('helpDialog').close());
$('helpDialog').addEventListener('click', e => { if (e.target === $('helpDialog')) $('helpDialog').close(); });
$('saveButton').addEventListener('click', savePreviewToV3);
$('confirmAudioSave').addEventListener('click', submitTeacherAudio);
$('audioPinInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitTeacherAudio(); });
$('closeAudioPin').addEventListener('click', () => { pendingModelSave = null; $('audioPinDialog').close(); });
$('confirmDelete').addEventListener('click', submitDeleteSentence);
$('closeDelete').addEventListener('click', () => { pendingDeleteSentence = null; $('deleteDialog').close(); });
let savedSourceLanguage = 'hi';
try { savedSourceLanguage = localStorage.getItem('csbSourceLanguage') || 'hi'; } catch (_) {}
$('sourceLanguage').value = LANGUAGE_PROFILES[savedSourceLanguage] ? savedSourceLanguage : 'hi';
applyLanguageProfile($('sourceLanguage').value);
initPronunciationLab();
// V3 never loads the shared V2 Google Sheet. Each teacher starts with an
// empty bank and, after the Firestore phase, will load only documents stored
// below that teacher's Firebase UID.
showEmptyV3Bank(window.MCSB_AUTH?.user || null);
window.addEventListener('mcsb-auth-changed', handleV3AuthChange);
window.addEventListener('mcsb-db-ready', () => {
  v3DatabaseReady = true;
  updateV3SaveControls();
});
window.addEventListener('mcsb-bank-changed', receiveV3Bank);
window.addEventListener('mcsb-bank-error', showV3BankError);
