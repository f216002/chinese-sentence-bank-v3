import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { app, auth } from './firebase-auth.js';

const ADMIN_EMAIL = 'f216002@gmail.com';
const db = getFirestore(app);
const requests = new Map();
const approvals = new Map();
let stopRequests = null;
let stopApprovals = null;

const byId = id => document.getElementById(id);

function stopListeners() {
  if (stopRequests) stopRequests();
  if (stopApprovals) stopApprovals();
  stopRequests = null;
  stopApprovals = null;
}

function dateText(value) {
  if (!value) return '—';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function td(text, className = '') {
  const cell = document.createElement('td');
  cell.textContent = text || '—';
  if (className) cell.className = className;
  return cell;
}

function actionButton(label, action, uid, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.uid = uid;
  button.className = className;
  return button;
}

function renderRequests() {
  const body = byId('requestRows');
  body.replaceChildren();
  const rows = [...requests.values()]
    .filter(item => item.status === 'pending')
    .sort((a, b) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0));

  for (const item of rows) {
    const row = document.createElement('tr');
    row.append(td(item.displayName || 'Teacher'));
    row.append(td(item.email, 'admin-email'));
    row.append(td(dateText(item.requestedAt)));
    row.append(td(item.status));
    const actions = document.createElement('td');
    actions.className = 'admin-actions';
    actions.append(
      actionButton('Approve', 'approve', item.uid, 'approve-action'),
      actionButton('Reject', 'reject', item.uid, 'reject-action')
    );
    row.append(actions);
    body.append(row);
  }
  byId('requestEmpty').hidden = rows.length > 0;
}

function renderApprovals() {
  const body = byId('approvedRows');
  body.replaceChildren();
  const rows = [...approvals.values()].sort((a, b) =>
    String(a.displayName || a.email || '').localeCompare(String(b.displayName || b.email || ''))
  );

  for (const item of rows) {
    const row = document.createElement('tr');
    row.append(td(item.displayName || 'Teacher'));
    row.append(td(item.email, 'admin-email'));
    row.append(td(item.role || 'teacher'));
    const statusCell = document.createElement('td');
    const chip = document.createElement('span');
    chip.className = 'status-chip ' + (item.active ? 'active' : 'inactive');
    chip.textContent = item.active ? 'Active' : (item.status || 'Suspended');
    statusCell.append(chip);
    row.append(statusCell);
    const actions = document.createElement('td');
    actions.className = 'admin-actions';
    actions.append(item.active
      ? actionButton('Suspend', 'suspend', item.uid, 'suspend-action')
      : actionButton('Restore', 'restore', item.uid, 'restore-action'));
    row.append(actions);
    body.append(row);
  }
  byId('approvedEmpty').hidden = rows.length > 0;
}

async function review(action, uid, button) {
  const request = requests.get(uid) || {};
  const approval = approvals.get(uid) || {};
  button.disabled = true;
  try {
    if (action === 'approve') {
      await setDoc(doc(db, 'approvedTeachers', uid), {
        uid,
        email: request.email || '',
        displayName: request.displayName || '',
        photoURL: request.photoURL || '',
        role: 'teacher',
        active: true,
        status: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: auth.currentUser.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
      await setDoc(doc(db, 'accessRequests', uid), {
        status: 'approved',
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser.uid
      }, { merge: true });
    } else if (action === 'reject') {
      await setDoc(doc(db, 'approvedTeachers', uid), {
        uid,
        email: request.email || '',
        displayName: request.displayName || '',
        active: false,
        status: 'rejected',
        role: 'teacher',
        updatedAt: serverTimestamp()
      }, { merge: true });
      await setDoc(doc(db, 'accessRequests', uid), {
        status: 'rejected',
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser.uid
      }, { merge: true });
    } else if (action === 'suspend' || action === 'restore') {
      await setDoc(doc(db, 'approvedTeachers', uid), {
        active: action === 'restore',
        status: action === 'restore' ? 'approved' : 'suspended',
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid,
        email: approval.email || '',
        displayName: approval.displayName || '',
        uid,
        role: approval.role || 'teacher'
      }, { merge: true });
    }
  } catch (error) {
    alert('Action failed: ' + (error.message || error.code));
  } finally {
    button.disabled = false;
  }
}

byId('adminWorkspace').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  review(button.dataset.action, button.dataset.uid, button);
});

onAuthStateChanged(auth, user => {
  stopListeners();
  requests.clear();
  approvals.clear();
  renderRequests();
  renderApprovals();

  const isAdmin = String(user?.email || '').toLowerCase() === ADMIN_EMAIL;
  byId('adminWorkspace').hidden = !isAdmin;
  byId('adminBlocked').hidden = isAdmin;

  if (!user) {
    byId('adminBlocked').textContent = 'Sign in with the administrator Google account to open this page.';
    return;
  }
  if (!isAdmin) {
    byId('adminBlocked').textContent = 'This Google account is not authorized to manage teacher access.';
    return;
  }

  byId('adminBlocked').textContent = '';
  stopRequests = onSnapshot(collection(db, 'accessRequests'), snapshot => {
    requests.clear();
    snapshot.forEach(item => requests.set(item.id, { uid: item.id, ...item.data() }));
    renderRequests();
  }, error => {
    byId('requestEmpty').hidden = false;
    byId('requestEmpty').textContent = 'Could not load requests: ' + (error.message || error.code);
  });

  stopApprovals = onSnapshot(collection(db, 'approvedTeachers'), snapshot => {
    approvals.clear();
    snapshot.forEach(item => approvals.set(item.id, { uid: item.id, ...item.data() }));
    renderApprovals();
  }, error => {
    byId('approvedEmpty').hidden = false;
    byId('approvedEmpty').textContent = 'Could not load approvals: ' + (error.message || error.code);
  });
});
