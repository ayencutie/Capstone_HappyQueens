// Talks to the PHP backend. Every URL is worked out from where THIS file lives:
// <project>/client-side/js/api.js  ->  <project>/api/...
(function () {
  if (window.hqApi) return;
  var base = document.currentScript ? document.currentScript.src : window.location.href;
  var ROOT = new URL('../../', base).href;

  function parse(res) {
    return res.json().catch(function () {
      return { ok: false, error: 'Unexpected server response. Did you open the site through http://localhost/ ?' };
    }).then(function (json) { json.status = res.status; return json; });
  }
  var NET_ERR = { ok: false, error: 'Cannot reach the server. Is XAMPP (Apache + MySQL) running, and are you using http://localhost/ ?' };

  function caller(file) {
    return async function (action, data, query) {
      var url = ROOT + file + '?action=' + action + (query ? '&' + new URLSearchParams(query).toString() : '');
      var opts = { credentials: 'same-origin' };
      if (data !== undefined) {
        opts.method = 'POST';
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(data);
      }
      try { return await parse(await fetch(url, opts)); } catch (e) { return NET_ERR; }
    };
  }

  window.hqApi = caller('api/auth.php');    // login, register, OTP ...
  window.hqAdmin = caller('api/admin.php'); // admin only
  window.hqShop = caller('api/shop.php');   // services, templates, orders (customer side)

  // multipart uploads (service photo, template files, customer design)
  function uploader(file) {
    return async function (action, formData) {
      try {
        return await parse(await fetch(ROOT + file + '?action=' + action, { method: 'POST', body: formData, credentials: 'same-origin' }));
      } catch (e) { return NET_ERR; }
    };
  }
  window.hqUpload = uploader('api/admin.php');
  window.hqShopUpload = uploader('api/shop.php');
  window.hqAi = caller('api/ai.php');

  // path saved in the database -> full URL the browser can load
  window.hqAsset = function (path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return ROOT + String(path).replace(/^\/+/, '');
  };
  window.hqRoot = ROOT;

  window.hqEsc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  window.hqOnReady = function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
  };
})();
