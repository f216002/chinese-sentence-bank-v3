import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { auth, app } from './firebase-auth.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const db = getFirestore(app);
let stopSentenceListener = null;

function teacherPath(uid) {
  return doc(db, 'teachers', uid);
}

function sentenceCollection(uid) {
  return collection(db, 'teachers', uid, 'sentences');
}

function modelAudioDocument(uid, recordId) {
  return doc(db, 'teachers', uid, 'modelAudio', recordId);
}

function publicSentenceData(sentence) {
  return {
    sourceLanguage: sentence.sourceLanguage || 'hi',
    sourceSentence: sentence.sourceSentence || sentence.hindiSentence || '',
    romanization: sentence.romanization || sentence.romanHindi || '',
    chineseSentence: sentence.chineseSentence || '',
    pinyin: sentence.pinyin || '',
    explanation: sentence.explanation || sentence.hindiExplanation || '',
    category: sentence.category || 'Other',
    tags: sentence.tags || '',
    aiSource: sentence.aiSource || 'ChatGPT / Gemini',
    originalPaste: sentence.originalPaste || '',
    updatedAt: serverTimestamp()
  };
}

function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

async function saveSentence(sentence) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in with Google first.');
  const payload = publicSentenceData(sentence);
  payload.teacherUid = user.uid;
  payload.createdAt = serverTimestamp();
  const saved = await addDoc(sentenceCollection(user.uid), payload);
  return saved.id;
}

async function deleteSentence(recordId) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in with Google first.');
  if (!recordId) throw new Error('The sentence ID is missing.');
  await Promise.all([
    deleteDoc(doc(db, 'teachers', user.uid, 'sentences', recordId)),
    deleteDoc(modelAudioDocument(user.uid, recordId))
  ]);
}

async function saveModelAudio(recordId, audioBase64, mimeType, byteSize) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in with Google first.');
  if (!recordId) throw new Error('The sentence ID is missing.');
  if (!audioBase64) throw new Error('The recording is empty.');
  if (Number(byteSize) > 650000 || audioBase64.length > 900000) {
    throw new Error('The recording is too large. Please record a shorter sentence.');
  }
  await setDoc(modelAudioDocument(user.uid, recordId), {
    teacherUid: user.uid,
    recordId,
    audioBase64,
    mimeType: mimeType || 'audio/webm',
    byteSize: Number(byteSize) || 0,
    updatedAt: serverTimestamp()
  });
  await setDoc(doc(db, 'teachers', user.uid, 'sentences', recordId), {
    hasModelAudio: true,
    modelAudioUpdatedAt: serverTimestamp()
  }, { merge: true });
}

async function loadModelAudio(recordId) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in with Google first.');
  if (!recordId) throw new Error('The sentence ID is missing.');
  const snapshot = await getDoc(modelAudioDocument(user.uid, recordId));
  return snapshot.exists() ? snapshot.data() : null;
}

async function openTeacherBank(user) {
  if (stopSentenceListener) {
    stopSentenceListener();
    stopSentenceListener = null;
  }

  if (!user) {
    dispatch('mcsb-bank-changed', { user: null, sentences: [] });
    return;
  }

  dispatch('mcsb-bank-loading', { user });
  await setDoc(teacherPath(user.uid), {
    uid: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    lastLoginAt: serverTimestamp()
  }, { merge: true });

  const sentenceQuery = query(sentenceCollection(user.uid), orderBy('createdAt', 'desc'));
  stopSentenceListener = onSnapshot(sentenceQuery, snapshot => {
    const sentences = snapshot.docs.map(item => ({
      recordId: item.id,
      ...item.data()
    }));
    dispatch('mcsb-bank-changed', { user, sentences });
  }, error => {
    dispatch('mcsb-bank-error', {
      user,
      message: error.message || error.code || 'Could not load the teacher bank.'
    });
  });
}

window.MCSB_DB = Object.freeze({
  db,
  saveSentence,
  deleteSentence,
  saveModelAudio,
  loadModelAudio
});
dispatch('mcsb-db-ready', { ready: true });

onAuthStateChanged(auth, user => {
  openTeacherBank(user).catch(error => {
    dispatch('mcsb-bank-error', {
      user,
      message: error.message || error.code || 'Could not open the teacher bank.'
    });
  });
});

export { db, saveSentence, deleteSentence, saveModelAudio, loadModelAudio };
