import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
const isFirebaseHosting = location.hostname === 'my-chinese-sentence-bank-v3.web.app';

const signInButton = document.getElementById('googleSignInButton');
const signOutButton = document.getElementById('googleSignOutButton');
const accountPanel = document.getElementById('teacherAccount');
const accountPhoto = document.getElementById('teacherAccountPhoto');
const accountName = document.getElementById('teacherAccountName');
const accountEmail = document.getElementById('teacherAccountEmail');
const authMessage = document.getElementById('authMessage');

function setAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle('error', isError);
}

function publishAuthState(user) {
  window.MCSB_AUTH = Object.freeze({
    ready: true,
    user: user ? Object.freeze({
      uid: user.uid,
      displayName: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || ''
    }) : null
  });
  window.dispatchEvent(new CustomEvent('mcsb-auth-changed', {
    detail: window.MCSB_AUTH
  }));
}

function showSignedOut() {
  signInButton.hidden = false;
  signOutButton.hidden = true;
  accountPanel.hidden = true;
  accountPhoto.removeAttribute('src');
  accountName.textContent = '';
  accountEmail.textContent = '';
  setAuthMessage('Sign in to open your teacher workspace.');
}

function showSignedIn(user) {
  signInButton.hidden = true;
  signOutButton.hidden = false;
  accountPanel.hidden = false;
  accountName.textContent = user.displayName || 'Teacher';
  accountEmail.textContent = user.email || '';
  if (user.photoURL) {
    accountPhoto.src = user.photoURL;
    accountPhoto.alt = `${user.displayName || 'Teacher'} profile photo`;
  } else {
    accountPhoto.removeAttribute('src');
    accountPhoto.alt = '';
  }
  setAuthMessage('Google account connected. Your teacher UID is ready.');
}

signInButton.addEventListener('click', async () => {
  signInButton.disabled = true;
  setAuthMessage('Opening Google sign-in…');
  try {
    if (isFirebaseHosting) {
      // Same-site redirect works reliably on iPhone without asking teachers to
      // disable Safari's popup blocker or privacy protection.
      await signInWithRedirect(auth, provider);
      return;
    }
    await signInWithPopup(auth, provider);
  } catch (error) {
    // Do not fall back to signInWithRedirect here. On GitHub Pages, some
    // mobile/privacy-partitioned browsers cannot recover Firebase's redirect
    // state from the firebaseapp.com helper domain and report
    // "missing initial state". A popup keeps the app page and auth state open.
    if (error.code === 'auth/popup-blocked') {
      setAuthMessage('Google sign-in was blocked. Open this page directly in Safari or Chrome and allow pop-ups, then try again.', true);
    } else if (error.code === 'auth/operation-not-supported-in-this-environment') {
      setAuthMessage('This in-app browser cannot complete Google sign-in. Open the website directly in Safari or Chrome.', true);
    } else if (error.code === 'auth/cancelled-popup-request') {
      setAuthMessage('The sign-in window was interrupted. Please tap Sign in with Google once more.', true);
    } else if (error.code === 'auth/popup-closed-by-user') {
      setAuthMessage('Google sign-in was closed before completion.');
    } else if (error.code === 'auth/unauthorized-domain') {
      setAuthMessage('This website domain has not yet been authorized in Firebase.', true);
    } else {
      setAuthMessage(`Google sign-in failed: ${error.message || error.code}`, true);
    }
  } finally {
    signInButton.disabled = false;
  }
});

// Surface redirect errors after Firebase Hosting returns from Google. The
// signed-in state itself is published by onAuthStateChanged below.
if (isFirebaseHosting) {
  getRedirectResult(auth).catch(error => {
    if (error.code === 'auth/unauthorized-domain') {
      setAuthMessage('This Firebase Hosting domain has not yet been authorized.', true);
    } else {
      setAuthMessage(`Google sign-in failed: ${error.message || error.code}`, true);
    }
  });
}

signOutButton.addEventListener('click', async () => {
  signOutButton.disabled = true;
  try {
    await signOut(auth);
  } catch (error) {
    setAuthMessage(`Sign-out failed: ${error.message || error.code}`, true);
  } finally {
    signOutButton.disabled = false;
  }
});

onAuthStateChanged(auth, user => {
  if (user) showSignedIn(user);
  else showSignedOut();
  publishAuthState(user);
});

export { app, auth };
