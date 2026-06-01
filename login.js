// ============================================================
// LOGIN — login.js
// Password check con SHA-256 (lato client)
// Per cambiare password: genera un nuovo hash su
// https://emn178.github.io/online-tools/sha256.html
// e sostituisci PASSWORD_HASH sotto.
// ============================================================

// Hash SHA-256 della password "leadanalyzer2024"
// Per cambiarla: sha256(nuova_password) e sostituisci qui
const PASSWORD_HASH = 'bc39ed9d74b6b212cffcb9f0ff567c9fec1aaafe115e276d438d9bc90ce4c117'; // "leadanalyzer2024"

const SESSION_KEY = 'la_auth';
const SESSION_DURATION_H = 8; // ore prima di richiedere di nuovo la password

// ── Controlla se già autenticato ─────────────────────────────
function checkAuth() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return false;
  try {
    const { expires } = JSON.parse(stored);
    return Date.now() < expires;
  } catch { return false; }
}

// ── Hash SHA-256 ─────────────────────────────────────────────
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Verifica password ─────────────────────────────────────────
async function verifyPassword(input) {
  const hash = await sha256(input.trim());
  return hash === PASSWORD_HASH;
}

// ── Salva sessione ────────────────────────────────────────────
function saveSession() {
  const expires = Date.now() + SESSION_DURATION_H * 60 * 60 * 1000;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ expires }));
}

// ── Init: mostra login o app ──────────────────────────────────
function initLogin() {
  if (checkAuth()) {
    showApp();
    return;
  }
  showLoginScreen();
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
}

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  // Focus sull'input
  setTimeout(() => document.getElementById('login-password')?.focus(), 100);
}

// ── Submit login ──────────────────────────────────────────────
async function submitLogin() {
  const input = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  if (!input) { errEl.textContent = 'Inserisci la password.'; return; }

  btn.disabled = true;
  btn.textContent = '...';

  const ok = await verifyPassword(input);

  if (ok) {
    saveSession();
    errEl.textContent = '';
    showApp();
  } else {
    errEl.textContent = 'Password non corretta.';
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
  }

  btn.disabled = false;
  btn.textContent = 'Accedi';
}

// Enter per submit
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('login-screen')?.style.display !== 'none') {
    submitLogin();
  }
});
