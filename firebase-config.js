/* Firebase web configuration for My Chinese Sentence Bank V3. */
export const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyChpInXumwIWaOrR4cU8KhNm1NK5-RdgQw',
  // Firebase Hosting uses a same-site auth helper so mobile Safari can safely
  // complete redirect sign-in. GitHub Pages keeps its existing popup flow.
  authDomain: location.hostname === 'my-chinese-sentence-bank-v3.web.app'
    ? 'my-chinese-sentence-bank-v3.web.app'
    : 'my-chinese-sentence-bank-v3.firebaseapp.com',
  projectId: 'my-chinese-sentence-bank-v3',
  storageBucket: 'my-chinese-sentence-bank-v3.firebasestorage.app',
  messagingSenderId: '178850974896',
  appId: '1:178850974896:web:f1d40b2ed4e7218b553f75'
});
