// Account menu — logged-in navbar dropdown (needs api.js loaded first)

// Logged-in pages are customers-only: ask the server, no session -> back to the landing page
(async function () {
  document.documentElement.style.visibility = 'hidden';
  const r = await hqApi('me');
  if (!r.ok || !r.user || r.user.role !== 'customer') {
    window.location.replace('index.html');
    return;
  }
  document.documentElement.style.visibility = '';
})();

document.addEventListener('DOMContentLoaded', function () {
  const accountMenu = document.getElementById('accountMenu');
  const accountMenuBtn = document.getElementById('accountMenuBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (!accountMenu || !accountMenuBtn) return;

  function openMenu() { accountMenu.classList.add('is-open'); accountMenuBtn.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { accountMenu.classList.remove('is-open'); accountMenuBtn.setAttribute('aria-expanded', 'false'); }

  accountMenuBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    accountMenu.classList.contains('is-open') ? closeMenu() : openMenu();
  });
  document.addEventListener('click', function (e) { if (!accountMenu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function () {
      await hqApi('logout', {});
      window.location.href = 'index.html';
    });
  }
});
