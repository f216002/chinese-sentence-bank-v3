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
let v3AccessApproved = false;

function parsePaste(text) {
  const labels = ['SOURCE', 'HINDI', 'TAMIL', 'THAI', 'KHMER', 'VIETNAMESE', 'INDONESIAN', 'NEPALI', 'BENGALI', 'BANGLA', 'SPANISH', 'ENGLISH', 'CHINESE', 'PINYIN', 'ROMANIZATION', 'ROMAN', 'EXPLANATION', 'CATEGORY', 'TAGS', 'AI SOURCE'];
  const found = {};
  // Use horizontal whitespace only around labels. `\\s` also consumes line
  // breaks and previously swallowed EXPLANATION when ROMANIZATION was empty.
  const horizontalSpace = '[^\\S\\r\\n]*';
  const pattern = new RegExp(`(?:^|\\r?\\n)${horizontalSpace}(?:\\*\\*)?${horizontalSpace}(${labels.join('|')})${horizontalSpace}:?${horizontalSpace}(?:\\*\\*)?${horizontalSpace}:?${horizontalSpace}`, 'gi');
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
  if (!sentence.hasModelAudio) {
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
  window.MCSB_DB.loadModelAudio(sentence.recordId).then(data => {
    button.disabled = false;
    if (!data || !data.audioBase64) throw new Error('The saved recording was not found.');
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
  }).catch(error => {
    button.disabled = false;
    setModelAudioStatus(button, `Teacher recording unavailable: ${error.message || 'unknown error'}`);
  });
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
    return new MediaRecorder(stream, {audioBitsPerSecond:48000});
  } catch (_) {
    return new MediaRecorder(stream);
  }
}

function audioBufferPeak(audioBuffer) {
  let peak = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const samples = audioBuffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
  }
  return peak;
}

async function kWeightedBuffer(audioBuffer) {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) return audioBuffer;
  const context = new OfflineContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  const shelf = context.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 1681.974;
  shelf.gain.value = 4;
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 38.135;
  highpass.Q.value = 0.5003;
  source.connect(shelf);
  shelf.connect(highpass);
  highpass.connect(context.destination);
  source.start();
  return context.startRendering();
}

function blockEnergy(audioBuffer, start, length) {
  let energy = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const samples = audioBuffer.getChannelData(channel);
    const end = Math.min(samples.length, start + length);
    let channelEnergy = 0;
    for (let index = start; index < end; index += 1) {
      channelEnergy += samples[index] * samples[index];
    }
    energy += channelEnergy / Math.max(1, end - start);
  }
  return energy;
}

function energyToLufs(energy) {
  return -0.691 + 10 * Math.log10(Math.max(energy, 1e-12));
}

function measureIntegratedLufs(audioBuffer) {
  const blockLength = Math.max(1, Math.round(audioBuffer.sampleRate * 0.4));
  const step = Math.max(1, Math.round(audioBuffer.sampleRate * 0.1));
  const energies = [];
  if (audioBuffer.length <= blockLength) {
    energies.push(blockEnergy(audioBuffer, 0, audioBuffer.length));
  } else {
    for (let start = 0; start + blockLength <= audioBuffer.length; start += step) {
      energies.push(blockEnergy(audioBuffer, start, blockLength));
    }
  }
  const aboveAbsoluteGate = energies.filter(energy => energyToLufs(energy) > -70);
  if (!aboveAbsoluteGate.length) return -70;
  const preliminaryEnergy = aboveAbsoluteGate.reduce((sum, value) => sum + value, 0) / aboveAbsoluteGate.length;
  const relativeGate = energyToLufs(preliminaryEnergy) - 10;
  const gated = aboveAbsoluteGate.filter(energy => energyToLufs(energy) > relativeGate);
  const integratedEnergy = gated.reduce((sum, value) => sum + value, 0) / Math.max(1, gated.length);
  return energyToLufs(integratedEnergy);
}

function encodeResampledMonoWav(audioBuffer, gain, outputSampleRate = 16000) {
  const duration = audioBuffer.length / audioBuffer.sampleRate;
  const outputLength = Math.max(1, Math.round(duration * outputSampleRate));
  const output = new ArrayBuffer(44 + outputLength * 2);
  const view = new DataView(output);
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + outputLength * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outputSampleRate, true);
  view.setUint32(28, outputSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, outputLength * 2, true);

  const channels = Array.from(
    {length: audioBuffer.numberOfChannels},
    (_, channel) => audioBuffer.getChannelData(channel)
  );
  const sourceRatio = audioBuffer.sampleRate / outputSampleRate;
  let offset = 44;
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition = outputIndex * sourceRatio;
    const left = Math.min(audioBuffer.length - 1, Math.floor(sourcePosition));
    const right = Math.min(audioBuffer.length - 1, left + 1);
    const fraction = sourcePosition - left;
    let sample = 0;
    for (let channel = 0; channel < channels.length; channel += 1) {
      sample += channels[channel][left] +
        (channels[channel][right] - channels[channel][left]) * fraction;
    }
    sample = (sample / channels.length) * gain;
    sample = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([output], {type:'audio/wav'});
}

async function normalizeTeacherRecording(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return {blob, mimeType:blob.type || 'audio/webm', normalized:false};
  const context = new AudioContextClass();
  try {
    const audioBuffer = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const weighted = await kWeightedBuffer(audioBuffer);
    const measuredLufs = measureIntegratedLufs(weighted);
    const peak = audioBufferPeak(audioBuffer);
    if (!Number.isFinite(measuredLufs) || peak <= 0) {
      return {blob, mimeType:blob.type || 'audio/webm', normalized:false};
    }
    const targetGain = Math.pow(10, (-16 - measuredLufs) / 20);
    const peakLimit = Math.pow(10, -1 / 20) / peak;
    const gain = Math.max(0.01, Math.min(targetGain, peakLimit, Math.pow(10, 18 / 20)));
    return {
      blob: encodeResampledMonoWav(audioBuffer, gain, 16000),
      mimeType: 'audio/wav',
      normalized: true
    };
  } finally {
    await context.close();
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
    recorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      const rawBlob = new Blob(chunks, {type:recorder.mimeType || 'audio/webm'});
      status.textContent = 'Balancing recording volume…';
      let processed = {blob:rawBlob, mimeType:rawBlob.type || 'audio/webm', normalized:false};
      try {
        processed = await normalizeTeacherRecording(rawBlob);
      } catch (error) {
        console.warn('Teacher recording normalization failed; using original audio.', error);
      }
      const key = sentence.recordId || `preview-${sentence.chineseSentence}`;
      const previous = cardRecordings.get(key);
      if (previous && previous.url) URL.revokeObjectURL(previous.url);
      const recording = {
        blob: processed.blob,
        url: URL.createObjectURL(processed.blob),
        mimeType: processed.mimeType
      };
      cardRecordings.set(key, recording);
      playButton.disabled = false;
      saveButton.disabled = preview || !sentence.recordId;
      recordButton.classList.remove('recording');
      recordButton.textContent = '● Record again';
      status.textContent = processed.normalized
        ? 'Recording ready. Volume balanced to about -16 LUFS with -1 dB peak protection.'
        : 'Recording ready. Original audio was kept.';
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
    }, 15000);
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
  $('audioSaveMessage').textContent = '';
  $('audioPinDialog').showModal();
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
  if (!pendingModelSave) { $('audioPinDialog').close(); return; }
  const {sentence, recording} = pendingModelSave;
  const button = $('confirmAudioSave');
  button.disabled = true;
  $('audioSaveMessage').textContent = 'Saving the teacher recording…';

  try {
    const audioData = await blobToBase64(recording.blob);
    if (!window.MCSB_DB) throw new Error('The V3 database is not ready. Refresh and try again.');
    await window.MCSB_DB.saveModelAudio(sentence.recordId, audioData, recording.mimeType, recording.blob.size);
    const cachedUrl = teacherAudioCache.get(sentence.recordId);
    if (cachedUrl && cachedUrl !== recording.url) URL.revokeObjectURL(cachedUrl);
    teacherAudioCache.set(sentence.recordId, recording.url);
    sentence.hasModelAudio = true;
    $('audioSaveMessage').textContent = 'Teacher recording saved! The yellow Chinese play button now uses your voice.';
    button.disabled = false;
    setTimeout(() => $('audioPinDialog').close(), 1400);
  } catch (error) {
    button.disabled = false;
    $('audioSaveMessage').textContent = `Save failed: ${error.message || 'Please record again.'}`;
  }
}

/* Pinyin quality check: every syllable must be a real Hanyu Pinyin syllable
   and the tone mark must sit on the correct vowel (a > o > e > iu/ui). Ported from V2. */
const PINYIN_BASE = new Set(('a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo e ei en eng er fa fan fang fei fen feng fo fou fu ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu long lou lu luan lun luo lv lve ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve o ou pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo ta tai tan tang tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo wa wai wan wang wei wen weng wo wu xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo').split(' '));
const TONE_VOWELS = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
const TONE_TO_BASE = { 'ā':'a','á':'a','ǎ':'a','à':'a','ē':'e','é':'e','ě':'e','è':'e','ī':'i','í':'i','ǐ':'i','ì':'i','ō':'o','ó':'o','ǒ':'o','ò':'o','ū':'u','ú':'u','ǔ':'u','ù':'u','ǖ':'v','ǘ':'v','ǚ':'v','ǜ':'v' };
function stripToneMarks(syllable) {
  return syllable.toLowerCase().replace(/ü/g, 'v').replace(new RegExp('[' + TONE_VOWELS + ']', 'g'), ch => TONE_TO_BASE[ch] || ch);
}
function toneMarkPositionOk(syllable) {
  const lower = syllable.toLowerCase();
  let marked = -1;
  for (let i = 0; i < lower.length; i += 1) {
    if (TONE_VOWELS.includes(lower[i])) { marked = i; break; }
  }
  if (marked === -1) return true;
  const base = stripToneMarks(syllable);
  const markedVowel = stripToneMarks(syllable[marked]);
  let expected;
  if (base.includes('a')) expected = 'a';
  else if (base.includes('o')) expected = 'o';
  else if (base.includes('e')) expected = 'e';
  else if (base.includes('iu')) expected = 'u';
  else if (base.includes('ui')) expected = 'i';
  else expected = markedVowel;
  return markedVowel === expected;
}
function segmentPinyin(base) {
  const memo = {};
  function rec(i) {
    if (i >= base.length) return [];
    if (Object.prototype.hasOwnProperty.call(memo, i)) return memo[i];
    for (let len = Math.min(6, base.length - i); len >= 1; len -= 1) {
      const syl = base.slice(i, i + len);
      const core = (syl.length > 2 && syl.endsWith('r') && !PINYIN_BASE.has(syl)) ? syl.slice(0, -1) : syl;
      if (PINYIN_BASE.has(core)) {
        const rest = rec(i + len);
        if (rest) return (memo[i] = [syl].concat(rest));
      }
    }
    return (memo[i] = null);
  }
  return rec(0);
}
function validatePinyin(pinyinText) {
  const issues = [];
  const tokens = String(pinyinText || '')
    .split(/[\s'’]+/)
    .map(t => t.replace(new RegExp('[^A-Za-z' + TONE_VOWELS + 'üÜ]', 'g'), ''))
    .filter(Boolean);
  tokens.forEach(token => {
    const base = stripToneMarks(token).toLowerCase();
    const syllables = segmentPinyin(base);
    if (!syllables) { issues.push(`“${token}” is not valid pinyin`); return; }
    let pos = 0;
    syllables.forEach(syl => {
      const original = token.slice(pos, pos + syl.length);
      pos += syl.length;
      if (!toneMarkPositionOk(original)) issues.push(`“${original}” has the tone mark on the wrong vowel`);
    });
  });
  return issues;
}

let pendingEditSentence = null;

function openEditDialog(sentence) {
  if (!sentence.recordId) return;
  pendingEditSentence = sentence;
  const profile = getLanguageProfile(sourceLanguageFor(sentence));
  $('editSourceLabel').textContent = `${profile.name} sentence`;
  $('editRomanLabel').textContent = profile.romanizationName || 'Romanization';
  $('editExplanationLabel').textContent = `${profile.name} explanation`;
  $('editSource').value = sourceSentenceFor(sentence);
  $('editChinese').value = sentence.chineseSentence || '';
  $('editPinyin').value = sentence.pinyin || '';
  $('editRoman').value = romanHindiFor(sentence);
  $('editExplanation').value = sourceExplanationFor(sentence);
  $('editCategory').value = sentence.category || 'Other';
  $('editTags').value = sentence.tags || '';
  $('editAiSource').value = sentence.aiSource || 'ChatGPT / Gemini';
  const list = $('editCategoryList');
  list.innerHTML = '';
  (state.categories || []).forEach(c => {
    const option = document.createElement('option');
    option.value = c;
    list.appendChild(option);
  });
  $('editRecordNote').textContent = `Editing record ${sentence.recordId}. Changes update this record in place; any teacher recording stays attached.`;
  const hasAudio = !!(sentence.hasModelAudio || recordingForSentence(sentence));
  $('editAudioNote').classList.toggle('hidden', !hasAudio);
  $('editMessage').textContent = '';
  $('confirmEdit').disabled = false;
  $('confirmEdit').textContent = 'Save changes';
  updateEditWarnings();
  $('editDialog').showModal();
  setTimeout(() => $('editSource').focus(), 50);
}

function updateEditWarnings() {
  const box = $('editWarnings');
  const warnings = [];
  const pinyinText = $('editPinyin').value.trim();
  const pinyinIssues = validatePinyin(pinyinText);
  pinyinIssues.slice(0, 8).forEach(issue => warnings.push(`Pinyin: ${issue}.`));
  if (pinyinIssues.length > 8) warnings.push(`…and ${pinyinIssues.length - 8} more pinyin issues.`);
  if (pinyinText && !/^[A-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]/.test(pinyinText)) warnings.push('Pinyin: the first syllable usually starts with a capital letter.');
  const chinese = $('editChinese').value.trim();
  const source = $('editSource').value.trim();
  const excludeId = pendingEditSentence ? pendingEditSentence.recordId : null;
  if (chinese) {
    const exactDupe = (state.sentences || []).find(s => s.recordId !== excludeId && (s.chineseSentence || '').trim() === chinese);
    if (exactDupe) warnings.push(`This Chinese sentence already exists as another record${exactDupe.recordId ? ` (${exactDupe.recordId})` : ''}. Saving is blocked until you change it.`);
  }
  if (source) {
    const sourceDupe = (state.sentences || []).find(s => s.recordId !== excludeId && sourceSentenceFor(s).trim() === source && (s.chineseSentence || '').trim() !== chinese);
    if (sourceDupe) warnings.push(`The same source sentence already exists with a different Chinese translation${sourceDupe.recordId ? ` (${sourceDupe.recordId})` : ''}. Check which version is correct before saving.`);
  }
  if (!warnings.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = '<strong>Please check before saving:</strong>';
  const list = document.createElement('ul');
  warnings.forEach(w => { const li = document.createElement('li'); li.textContent = w; list.appendChild(li); });
  box.appendChild(list);
}

async function submitEdit() {
  if (!pendingEditSentence) { $('editDialog').close(); return; }
  const original = pendingEditSentence;
  const edited = {
    sourceSentence: $('editSource').value.trim(),
    chineseSentence: $('editChinese').value.trim(),
    pinyin: $('editPinyin').value.trim(),
    romanization: $('editRoman').value.trim(),
    explanation: $('editExplanation').value.trim(),
    category: $('editCategory').value.trim() || 'Other',
    tags: $('editTags').value.trim(),
    aiSource: $('editAiSource').value.trim() || 'ChatGPT / Gemini'
  };
  const profile = getLanguageProfile(sourceLanguageFor(original));
  const missing = [[profile.name, edited.sourceSentence], ['Chinese', edited.chineseSentence], ['Pinyin', edited.pinyin], ['Romanization', edited.romanization], ['Explanation', edited.explanation]]
    .filter(([, value]) => !value).map(([label]) => label);
  if (missing.length) { $('editMessage').textContent = `Please fill in: ${missing.join(', ')}.`; return; }
  const exactDupe = (state.sentences || []).find(s => s.recordId !== original.recordId && (s.chineseSentence || '').trim() === edited.chineseSentence);
  if (exactDupe) { $('editMessage').textContent = `Blocked: this Chinese sentence already exists as record ${exactDupe.recordId || 'another record'}.`; return; }

  const button = $('confirmEdit');
  button.disabled = true;
  $('editMessage').textContent = 'Saving changes…';
  try {
    if (!window.MCSB_DB) throw new Error('The V3 database is not ready. Refresh and try again.');
    await window.MCSB_DB.updateSentence(original.recordId, {
      ...edited,
      sourceLanguage: sourceLanguageFor(original),
      originalPaste: original.originalPaste || ''
    });
    pendingEditSentence = null;
    $('editMessage').textContent = 'Changes saved.';
    setTimeout(() => $('editDialog').close(), 700);
  } catch (error) {
    button.disabled = false;
    $('editMessage').textContent = `Save failed: ${(error && error.message) || 'Unknown error.'}`;
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
  const editButton = node.querySelector('.card-edit-button');
  if (editButton) {
    editButton.hidden = preview;
    if (!preview) editButton.addEventListener('click', () => openEditDialog(sentence));
  }
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
  speak.title = sentence.hasModelAudio ? 'Play teacher model voice' : 'Play browser voice';
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

function voiceStatus(button, message) {
  const card = button && button.closest('.sentence-card');
  const status = card && card.querySelector('.card-recording-status');
  if (status) status.textContent = message;
}

function availableVoices() {
  return 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
}

function waitForVoices(timeout = 1800) {
  const current = availableVoices();
  if (current.length) return Promise.resolve(current);
  return new Promise(resolve => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(availableVoices());
    };
    speechSynthesis.addEventListener('voiceschanged', done, {once:true});
    setTimeout(done, timeout);
  });
}

function exactVoiceFor(voices, locale) {
  const wanted = String(locale || '').toLowerCase();
  return voices.find(voice => String(voice.lang || '').toLowerCase() === wanted) || null;
}

async function speakChinese(text, button) {
  if (!('speechSynthesis' in window)) {
    voiceStatus(button, 'Speech is not supported in this browser.');
    return;
  }
  const voices = await waitForVoices();
  // Never substitute Mainland Mandarin (zh-CN) for Taiwanese Mandarin.
  const voice = exactVoiceFor(voices, 'zh-TW');
  if (!voice) {
    voiceStatus(button, 'Taiwan Mandarin voice (zh-TW) is not installed on this device.');
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-TW';
  utterance.voice = voice;
  utterance.rate = Number(state.settings.speechRate) || 0.85;
  utterance.onstart = () => {
    button.classList.add('speaking');
    voiceStatus(button, `Playing Taiwan Mandarin: ${voice.name}`);
  };
  utterance.onend = () => {
    button.classList.remove('speaking');
    voiceStatus(button, 'Taiwan Mandarin playback finished.');
  };
  utterance.onerror = () => {
    button.classList.remove('speaking');
    voiceStatus(button, 'Taiwan Mandarin playback failed on this device.');
  };
  speechSynthesis.speak(utterance);
}

function speakHindi(text, button) {
  return speakSourceLanguage(text, 'hi-IN', button);
}

async function speakSourceLanguage(text, locale, button) {
  const normalizedLocale = String(locale || '').toLowerCase();
  const cloudVoiceNames = {
    'km-kh': 'Khmer',
    'th-th': 'Thai',
    'vi-vn': 'Vietnamese',
    'ne-np': 'Nepali',
    'ta-in': 'Tamil',
    'bn-bd': 'Bengali'
  };
  if (cloudVoiceNames[normalizedLocale]) {
    const languageName = cloudVoiceNames[normalizedLocale];
    if (window.MCSB_TTS?.playSourceSpeech) {
      await window.MCSB_TTS.playSourceSpeech(text, locale, languageName, button, voiceStatus);
    } else {
      voiceStatus(button, `${languageName} cloud voice is still loading. Please tap play again.`);
    }
    return;
  }
  if (!('speechSynthesis' in window)) {
    voiceStatus(button, 'Speech is not supported in this browser.');
    return;
  }
  const voices = await waitForVoices();
  const languageCode = normalizedLocale.split('-')[0];
  const voice = exactVoiceFor(voices, normalizedLocale) ||
    voices.find(item => String(item.lang || '').toLowerCase().split('-')[0] === languageCode) || null;
  const profile = Object.values(LANGUAGE_PROFILES).find(item =>
    String(item.locale || '').toLowerCase() === normalizedLocale
  ) || getLanguageProfile(state.sourceLanguage);
  if (!voice) {
    const languageName = normalizedLocale === 'km-kh' ? 'Khmer' : profile.name;
    voiceStatus(button, `${languageName} voice (${locale}) is not available on this device. A cloud voice is required.`);
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  utterance.voice = voice;
  utterance.rate = 0.85;
  utterance.onstart = () => {
    button.classList.add('speaking');
    voiceStatus(button, `Playing ${profile.name}: ${voice.name}`);
  };
  utterance.onend = () => {
    button.classList.remove('speaking');
    voiceStatus(button, `${profile.name} playback finished.`);
  };
  utterance.onerror = () => {
    button.classList.remove('speaking');
    voiceStatus(button, `${profile.name} playback failed on this device.`);
  };
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
  const ready = Boolean(v3DatabaseReady && v3AccessApproved && window.MCSB_DB);
  const button = $('saveButton');
  button.disabled = !(state.preview && user && ready);
  if (!user) button.textContent = 'Sign in to save';
  else if (!ready) button.textContent = 'Connecting database…';
  else button.textContent = 'Save to my personal bank';
}

async function savePreviewToV3() {
  if (!state.preview) return;
  // Shared-curriculum supplement mode: tag the sentence with its lesson before saving.
  if (window.__curSupplementLesson && state.preview) {
    const extra = window.__curSupplementLesson.name + ', 補充';
    state.preview.tags = state.preview.tags ? (state.preview.tags + ', ' + extra) : extra;
  }
  const button = $('saveButton');
  button.disabled = true;
  $('v3SaveMessage').textContent = 'Saving to your personal bank…';
  try {
    await window.MCSB_DB.saveSentence(state.preview);
    state.preview = null;
    $('pasteInput').value = '';
    $('previewPanel').classList.add('hidden');
    $('v3SaveMessage').textContent = window.__curSupplementLesson
      ? '已存入你的私人句庫（本課補充）。公版課程未被改動。'
      : '';
    $('libraryTitle').scrollIntoView({behavior:'smooth'});
  } catch (error) {
    $('v3SaveMessage').textContent = `Save failed: ${error.message || 'Unknown error.'}`;
  } finally {
    window.__curSupplementLesson = null;
    updateV3SaveControls();
  }
}

function handleTeacherAccess(event) {
  const detail = event.detail || window.MCSB_ACCESS || {};
  const status = detail.status || 'checking';
  const user = detail.user || null;
  v3AccessApproved = status === 'approved';
  document.body.dataset.access = status;

  const title = $('accessTitle');
  const message = $('accessMessage');
  const email = $('accessEmail');
  if (email) email.textContent = user?.email || '';

  const copy = {
    'signed-out': ['Teacher sign-in required', 'Sign in with the Google account registered for your teaching team.'],
    checking: ['Checking teacher access…', 'Google has verified your identity. The internal teacher list is now being checked.'],
    pending: ['Teacher approval is pending', 'Your Google account is verified. Your request has been sent to the administrator for internal approval.'],
    rejected: ['Teacher access was not approved', 'This Google account is not authorized for the teacher workspace. Please contact the administrator.'],
    suspended: ['Teacher access is suspended', 'Your saved data is retained, but access is currently paused. Please contact the administrator.'],
    error: ['Access check could not be completed', detail.message || 'Please refresh the page and try again.']
  };
  const selected = copy[status] || copy.checking;
  if (title) title.textContent = selected[0];
  if (message) message.textContent = selected[1];

  const authMessage = $('authMessage');
  if (authMessage && status !== 'approved') authMessage.textContent = selected[0];
  if (status === 'approved' && authMessage) {
    authMessage.textContent = detail.isAdmin
      ? 'Administrator account connected.'
      : 'Approved teacher account connected.';
  }

  if (!v3AccessApproved) showEmptyV3Bank(user);
  updateV3SaveControls();
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
  if (window.__refreshCurriculum) window.__refreshCurriculum();
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
$('saveButton').addEventListener('click', savePreviewToV3);
$('confirmAudioSave').addEventListener('click', submitTeacherAudio);
$('closeAudioPin').addEventListener('click', () => { pendingModelSave = null; $('audioPinDialog').close(); });
$('confirmDelete').addEventListener('click', submitDeleteSentence);
$('closeDelete').addEventListener('click', () => { pendingDeleteSentence = null; $('deleteDialog').close(); });
$('confirmEdit').addEventListener('click', submitEdit);
$('closeEdit').addEventListener('click', () => { pendingEditSentence = null; $('editDialog').close(); });
['editSource', 'editChinese', 'editPinyin', 'editRoman', 'editExplanation'].forEach(id => {
  $(id).addEventListener('input', updateEditWarnings);
});
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
window.addEventListener('mcsb-access-changed', handleTeacherAccess);
window.addEventListener('mcsb-db-ready', () => {
  v3DatabaseReady = true;
  updateV3SaveControls();
});
window.addEventListener('mcsb-bank-changed', receiveV3Bank);
window.addEventListener('mcsb-bank-error', showV3BankError);

/* ================= Shared Curriculum (V3 pilot · read-only for teachers) =================
 * Pilot scope: Book 1 Lesson 1 (你好！), Hindi + English, embedded data file.
 * Teachers cannot edit shared content. Per-card actions copy into the teacher's
 * own private bank (teachers/{uid}/sentences), where V2's full add/edit/delete
 * workflow applies. Audio reuses V3's tested TTS routing:
 *   Chinese -> speakChinese (browser zh-TW) · Hindi/English -> speakSourceLanguage
 *   (browser voices; ta/th/km/vi/ne/bn use Azure TTS via Cloud Function).
 */(function initSharedCurriculum(){
  var section = $('sharedCurriculum');
  if (!section) return;
  var _raw = window.PILOT_CURRICULUM;
  var DATA = Array.isArray(_raw) ? _raw : ((_raw && _raw.records) || []);
  /* V2 parity: 課文/生詞/語法/練習/文化/補充 tabs; 目標 stays a tab in V3 (was header in V2). */
  var ORDER = ['目標', '課文', '生詞', '語法', '練習', '文化', '補充'];
  var ICONS = { '目標': '🎯', '課文': '📖', '生詞': '📝', '語法': '📐', '練習': '✏️', '文化': '🌏', '補充': '➕' };
  var LOCALES = { hi: 'hi-IN', en: 'en-US' };
  var LANG_LABEL = { hi: '印地文', en: 'English' };
  var LESSON_NAME = '第一冊第1課 你好！';
  var curLang = 'hi', curSection = '課文';

  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function tr(rec){ return rec[curLang] || rec.hi; }
  function msg(t){ var el = $('curMessage'); if (el) el.textContent = t || ''; }
  function tagList(rec){ return String(rec.tags || '').split(',').map(function(t){ return t.trim(); }).filter(Boolean); }

  /* ---- Teacher's own supplementary sentences for this lesson (private bank) ---- */
  function supplementRecs(){
    var all = (typeof state !== 'undefined' && state.sentences) || [];
    return all.filter(function(s){
      var tags = String(s.tags || '');
      return tags.indexOf(LESSON_NAME) >= 0 && tags.indexOf('補充') >= 0;
    });
  }

  function renderTabs(){
    var tabs = $('curTabs'); tabs.innerHTML = '';
    ORDER.forEach(function(key){
      var n = (key === '補充')
        ? supplementRecs().length
        : DATA.filter(function(r){ return r.section === key; }).length;
      if (!n && key !== '補充') return; /* 補充分頁永遠顯示 */
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lab-tab' + (key === curSection ? ' active' : '');
      b.textContent = (ICONS[key] || '') + ' ' + key + '（' + n + '）';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', key === curSection ? 'true' : 'false');
      b.addEventListener('click', function(){ curSection = key; render(); });
      tabs.appendChild(b);
    });
  }

  function cardNode(rec){
    var t = tr(rec);
    var node = document.createElement('article');
    node.className = 'sentence-card curriculum-card';
    node.innerHTML =
        '<div class="card-top"><span class="category-pill">' + esc(rec.section) + '</span>'
      + '<div class="card-admin"><span class="curriculum-readonly">公版 · 唯讀</span></div></div>'
      + (rec.speaker ? '<div><span class="curriculum-speaker">' + esc(rec.speaker) + '</span></div>' : '')
      + '<div class="hindi-row"><p class="hindi">' + esc(t.source) + '</p>'
      + '<button class="hindi-speak-button" type="button" aria-label="Play ' + esc(LANG_LABEL[curLang]) + ' pronunciation">▶</button></div>'
      + (t.roman ? '<p class="roman-hindi">Roman: ' + esc(t.roman) + '</p>' : '')
      + '<div class="chinese-row"><h3 class="chinese">' + esc(rec.zh) + '</h3>'
      + '<button class="speak-button" type="button" aria-label="Play Taiwanese Mandarin pronunciation">▶</button></div>'
      + (rec.pinyin ? '<p class="pinyin">' + esc(rec.pinyin) + '</p>' : '')
      + '<details><summary><span class="explanation-label">' + esc(LANG_LABEL[curLang]) + '解說</span> <span>＋</span></summary>'
      + '<div class="explanation">' + esc(t.explanation || '') + '</div></details>'
      + '<div class="curriculum-actions">'
      + '<button class="secondary-button" type="button" data-act="copy">📋 複製到私人句庫</button>'
      + '<button class="secondary-button" type="button" data-act="fav">⭐ 收藏</button>'
      + '</div>';
    var srcBtn = node.querySelector('.hindi-speak-button');
    srcBtn.addEventListener('click', function(){ speakSourceLanguage(t.source, LOCALES[curLang], srcBtn); });
    var zhBtn = node.querySelector('.speak-button');
    zhBtn.addEventListener('click', function(){ speakChinese(rec.zh, zhBtn); });
    node.querySelector('[data-act="copy"]').addEventListener('click', function(e){ copyToBank(rec, false, e.currentTarget); });
    node.querySelector('[data-act="fav"]').addEventListener('click', function(e){ copyToBank(rec, true, e.currentTarget); });
    return node;
  }

  /* ---- 課文： group by dialogue, with 連播 (play-all) ---- */
  var TEXT_ORDER = ['對話一', '對話二', '對話三', '對話', '短文', '課文'];
  function textGroupName(rec){
    var tags = tagList(rec);
    for (var i = 0; i < TEXT_ORDER.length; i++) if (tags.indexOf(TEXT_ORDER[i]) >= 0) return TEXT_ORDER[i];
    return '課文';
  }
  var groupPlayState = null;
  function stopGroupPlay(){
    try { speechSynthesis.cancel(); } catch (_){}
    if (groupPlayState && groupPlayState.btn){
      groupPlayState.btn.classList.remove('text-playing');
      groupPlayState.btn.textContent = '▶ 連播';
    }
    groupPlayState = null;
  }
  async function playGroup(recs, btn){
    if (groupPlayState){ stopGroupPlay(); return; }
    if (!('speechSynthesis' in window)){ msg('此瀏覽器不支援語音播放。'); return; }
    var voices = await waitForVoices();
    var voice = exactVoiceFor(voices, 'zh-TW');
    if (!voice){ msg('找不到台灣國語（zh-TW）語音。'); return; }
    groupPlayState = { recs: recs.slice(), i: 0, btn: btn, voice: voice };
    btn.classList.add('text-playing');
    btn.textContent = '⏹ 停止';
    playNextGroupLine();
  }
  function playNextGroupLine(){
    var st = groupPlayState;
    if (!st) return;
    if (st.i >= st.recs.length){ stopGroupPlay(); return; }
    var line = st.recs[st.i]; st.i += 1;
    try {
      var u = new SpeechSynthesisUtterance(line.zh || '');
      u.lang = 'zh-TW'; u.voice = st.voice;
      u.rate = (typeof state !== 'undefined' && Number(state.settings.speechRate)) || 0.85;
      u.onend = u.onerror = function(){ playNextGroupLine(); };
      speechSynthesis.speak(u);
    } catch (_){ playNextGroupLine(); }
  }
  function renderTextGroups(grid, recs){
    var groups = {};
    recs.forEach(function(r){
      var g = textGroupName(r);
      (groups[g] = groups[g] || []).push(r);
    });
    TEXT_ORDER.filter(function(g){ return groups[g]; }).forEach(function(g){
      var lines = groups[g];
      var head = document.createElement('div');
      head.className = 'text-group-head';
      var title = document.createElement('h4');
      title.className = 'text-group-head-title';
      title.textContent = g + '（' + lines.length + '）';
      var playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'secondary-button text-play-button';
      playBtn.textContent = '▶ 連播';
      playBtn.setAttribute('aria-label', '連播' + g);
      playBtn.addEventListener('click', function(){ playGroup(lines, playBtn); });
      head.appendChild(title); head.appendChild(playBtn);
      grid.appendChild(head);
      lines.forEach(function(rec){ grid.appendChild(cardNode(rec)); });
    });
  }

  /* ---- 生詞： group by 生詞一 / 生詞二 ---- */
  var VOCAB_ORDER = ['生詞一', '生詞二', '生詞'];
  function vocabGroupName(rec){
    var tags = tagList(rec);
    for (var i = 0; i < VOCAB_ORDER.length; i++) if (tags.indexOf(VOCAB_ORDER[i]) >= 0) return VOCAB_ORDER[i];
    return '生詞';
  }
  function renderVocabGroups(grid, recs){
    var groups = {};
    recs.forEach(function(r){
      var g = vocabGroupName(r);
      (groups[g] = groups[g] || []).push(r);
    });
    VOCAB_ORDER.filter(function(g){ return groups[g]; }).forEach(function(g){
      var h = document.createElement('h4');
      h.className = 'text-group-head-title';
      h.textContent = g + '（' + groups[g].length + '）';
      grid.appendChild(h);
      groups[g].forEach(function(rec){ grid.appendChild(cardNode(rec)); });
    });
  }

  /* ---- 語法： group by grammar point, 句型 as pattern header ---- */
  function grammarKey(rec){
    var tags = tagList(rec);
    for (var i = 0; i < tags.length; i++){
      if (/^L\d+-G\d+$/i.test(tags[i])) return tags[i].toUpperCase();
    }
    return '其他';
  }
  function renderGrammarGroups(grid, recs){
    var groups = {};
    recs.forEach(function(r){
      var k = grammarKey(r);
      (groups[k] = groups[k] || []).push(r);
    });
    Object.keys(groups).sort(function(a, b){
      var na = parseInt((a.match(/G(\d+)/) || [0, 999])[1], 10);
      var nb = parseInt((b.match(/G(\d+)/) || [0, 999])[1], 10);
      return na - nb;
    }).forEach(function(k){
      var items = groups[k];
      var point = null;
      for (var i = 0; i < items.length; i++){
        if (tagList(items[i]).indexOf('句型') >= 0){ point = items[i]; break; }
      }
      if (!point) point = items[0];
      var examples = items.filter(function(r){ return r !== point; });
      var t = tr(point);
      var block = document.createElement('div');
      block.className = 'grammar-block';
      block.innerHTML =
          '<div class="grammar-pattern" lang="zh-TW">' + esc(point.zh) + '</div>'
        + (point.pinyin ? '<div class="grammar-pinyin">' + esc(point.pinyin) + '</div>' : '')
        + '<div class="grammar-source">' + esc(t.source) + '</div>'
        + (t.explanation ? '<div class="grammar-function">' + esc(t.explanation) + '</div>' : '');
      grid.appendChild(block);
      examples.forEach(function(rec){ grid.appendChild(cardNode(rec)); });
    });
  }

  /* ---- 補充： teacher's own supplements for this lesson ---- */
  function renderSupp(grid){
    var bar = document.createElement('div');
    bar.className = 'supp-bar';
    bar.innerHTML =
        '<p class="supp-hint">老師針對本課補充的句子：課堂上臨時加的例句、學生問到的句子，都可以記在這裡，跟著本課走。按右方按鈕前往上方的 AI 新增流程，完成後句子會自動歸入本課「補充」（存入你的私人句庫，公版內容不會被改動）。</p>'
      + '<button class="secondary-button" type="button">＋ 新增補充句子</button>';
    bar.querySelector('button').addEventListener('click', startSupplement);
    grid.appendChild(bar);
    var recs = supplementRecs();
    if (!recs.length){
      var empty = document.createElement('div');
      empty.className = 'loading-card';
      var approved = (window.MCSB_ACCESS && window.MCSB_ACCESS.status === 'approved');
      empty.textContent = approved
        ? '還沒有補充內容，按上面按鈕新增第一句。'
        : '登入並通過老師審核後，你為本課新增的補充句子會顯示在這裡。';
      grid.appendChild(empty);
      return;
    }
    recs.forEach(function(s){ grid.appendChild(createCard(s)); });
  }

  function render(){
    stopGroupPlay();
    renderTabs();
    var grid = $('curGrid'); grid.innerHTML = '';
    if (curSection === '補充'){
      renderSupp(grid);
    } else {
      var recs = DATA.filter(function(r){ return r.section === curSection; });
      if (curSection === '課文') renderTextGroups(grid, recs);
      else if (curSection === '生詞') renderVocabGroups(grid, recs);
      else if (curSection === '語法') renderGrammarGroups(grid, recs);
      else recs.forEach(function(rec){ grid.appendChild(cardNode(rec)); });
    }
    $('curDraftNote').textContent = curLang === 'en'
      ? 'English: AI draft — pending teacher review（AI 初稿，待老師校對）'
      : '印地文：V2 reviewed baseline';
  }

  function buildPaste(rec, t){
    return ['SOURCE:', t.source, '', 'CHINESE:', rec.zh, '', 'PINYIN:', rec.pinyin || '', '',
      'ROMANIZATION:', t.roman || '', '', 'EXPLANATION:', t.explanation || '', '',
      'CATEGORY:', '課程', '', 'TAGS:', '公版課程, ' + LESSON_NAME].join('\n');
  }

  async function copyToBank(rec, favorite, btn){
    if (!v3AccessApproved){ msg('請先登入並通過老師審核。'); return; }
    btn.disabled = true;
    msg(favorite ? '收藏中…' : '複製到私人句庫中…');
    try {
      var t = tr(rec);
      var tags = ['公版課程', LESSON_NAME, rec.section];
      if (favorite) tags.unshift('收藏');
      await window.MCSB_DB.saveSentence({
        sourceLanguage: curLang,
        sourceSentence: t.source,
        romanization: t.roman || '',
        chineseSentence: rec.zh,
        pinyin: rec.pinyin || '',
        explanation: t.explanation || '',
        category: '課程',
        tags: tags.join(', '),
        aiSource: 'V3 公版課程 pilot',
        originalPaste: buildPaste(rec, t)
      });
      msg((favorite ? '已收藏 ⭐' : '已複製到私人句庫 📋') + ' —— 可在下方 My sentence bank 自由修改或刪除。2 秒後重新整理…');
      setTimeout(function(){
        try { location.hash = 'sharedCurriculum'; } catch (_){}
        location.reload();
      }, 2000);
    } catch (err) {
      msg('複製失敗：' + ((err && err.message) || '未知錯誤'));
      btn.disabled = false;
    }
  }

  function startSupplement(){
    window.__curSupplementLesson = { code: 'B1-L01', name: LESSON_NAME };
    msg('');
    $('createPrompt').scrollIntoView({ behavior: 'smooth' });
    $('promptMessage').textContent = '補充模式：「' + LESSON_NAME + '」—— 經 AI 流程產生的下一句將自動標記為本課補充，存入你的私人句庫（公版內容不會被改動）。';
    setTimeout(function(){ try { $('promptSentence').focus({ preventScroll: true }); } catch (_){} }, 600);
  }

  $('curLangHi').addEventListener('click', function(){
    curLang = 'hi';
    $('curLangHi').classList.add('active'); $('curLangHi').setAttribute('aria-selected', 'true');
    $('curLangEn').classList.remove('active'); $('curLangEn').setAttribute('aria-selected', 'false');
    render();
  });
  $('curLangEn').addEventListener('click', function(){
    curLang = 'en';
    $('curLangEn').classList.add('active'); $('curLangEn').setAttribute('aria-selected', 'true');
    $('curLangHi').classList.remove('active'); $('curLangHi').setAttribute('aria-selected', 'false');
    render();
  });
  $('curAddSupplement').addEventListener('click', startSupplement);

  if (!DATA.length){
    $('curGrid').innerHTML = '<div class="loading-card">公版課程資料載入失敗，請重新整理頁面。</div>';
    return;
  }
  render();

  /* Refresh the 補充 tab count/content when the personal bank finishes loading. */
  window.__refreshCurriculum = function(){
    renderTabs();
    if (curSection === '補充') render();
  };

  if (location.hash === '#sharedCurriculum'){
    setTimeout(function(){ section.scrollIntoView(); }, 900);
  }
})();

