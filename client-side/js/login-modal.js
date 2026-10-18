// Log In modal — shared behavior across all pages (needs api.js loaded first)

var HQ_ADMIN_HOME = '../../admin-dashboard.html';   // from client-side/html/ up to the project root
var HQ_CUSTOMER_HOME = 'homepage.html';             // logged-in customer homepage (same folder)

async function hqLogin(identifier, password) {
  const r = await hqApi('login', { identifier: identifier, password: password });
  if (!r.ok) { alert(r.error || 'Login failed.'); return false; }
  var next = null;
  try { next = sessionStorage.getItem('hq_next'); sessionStorage.removeItem('hq_next'); } catch (e) {}
  if (!/^[A-Za-z0-9._-]+\.html(\?[A-Za-z0-9=&_.-]*)?$/.test(next || '')) next = null;
  window.location.href = r.role === 'admin' ? HQ_ADMIN_HOME : (next || HQ_CUSTOMER_HOME);
  return true;
}

async function hqLoginWithGoogle() {
  const r = await hqApi('google', {});
  alert(r.error || 'Google sign-in is not available yet.');
}

function openLoginModal() {
  const overlay = document.getElementById('loginModalOverlay');
  if (!overlay) return;
  overlay.classList.add('is-open');
  document.body.classList.add('modal-open');
  const firstInput = document.getElementById('loginIdentifier');
  if (firstInput) firstInput.focus();
}

function closeLoginModal() {
  const overlay = document.getElementById('loginModalOverlay');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  document.body.classList.remove('modal-open');
}

document.addEventListener('DOMContentLoaded', function () {
  const loginTrigger = document.getElementById('loginNavBtn');
  const overlay = document.getElementById('loginModalOverlay');
  const closeBtn = document.getElementById('loginModalClose');
  const form = document.getElementById('loginModalForm');
  const googleBtn = document.getElementById('googleModalLoginBtn');
  const registerBtn = document.getElementById('goToRegisterBtn');

  if (loginTrigger) loginTrigger.addEventListener('click', openLoginModal);
  if (closeBtn) closeBtn.addEventListener('click', closeLoginModal);
  if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) closeLoginModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLoginModal(); });

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const identifier = document.getElementById('loginIdentifier').value.trim();
      const password = document.getElementById('loginModalPassword').value;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      await hqLogin(identifier, password);
      btn.disabled = false;
    });
  }

  // Standalone login.html page form
  const pageForm = document.getElementById('loginForm');
  if (pageForm) {
    pageForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      await hqLogin(document.getElementById('loginEmail').value.trim(),
                    document.getElementById('loginPassword').value);
    });
  }
  const pageGoogle = document.getElementById('googleLoginBtn');
  if (pageGoogle) pageGoogle.addEventListener('click', hqLoginWithGoogle);

  if (googleBtn) googleBtn.addEventListener('click', hqLoginWithGoogle);
  if (registerBtn) registerBtn.addEventListener('click', function () { window.location.href = '../html/register.html'; });
});
