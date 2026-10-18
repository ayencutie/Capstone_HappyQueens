// Shared by every admin page (load AFTER api.js, in <head>):
//  - only a real admin session (checked on the server) may see the page
//  - account dropdown + log out
(function () {
  document.documentElement.style.visibility = 'hidden';
  hqApi('me').then(function (r) {
    if (!r.ok || !r.user || r.user.role !== 'admin') {
      window.location.replace(hqAsset('client-side/html/index.html'));
    } else {
      document.documentElement.style.visibility = '';
    }
  });

  hqOnReady(function () {
    var menu = document.getElementById('accountMenu');
    var btn = document.getElementById('accountMenuBtn');
    var out = document.getElementById('logoutBtn');
    if (menu && btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = menu.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', function (e) {
        if (!menu.contains(e.target)) { menu.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
      });
    }
    if (out) out.addEventListener('click', async function (e) {
      e.preventDefault();
      await hqApi('logout', {});
      window.location.href = hqAsset('client-side/html/index.html');
    });
  });

  // small helpers other admin scripts use
  window.hqPeso = function (n) { return '\u20B1' + Number(n).toLocaleString('en-PH'); };
  window.hqDate = function (d) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
})();
