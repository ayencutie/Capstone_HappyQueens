// Calls the PHP backend. The URL is worked out from where THIS file lives:
// <project>/client-side/js/api.js  ->  <project>/api/auth.php
(function () {
  if (window.hqApi) return;
  var base = document.currentScript ? document.currentScript.src : window.location.href;
  var API_URL = new URL('../../api/auth.php', base).href;

  window.hqApi = async function (action, data) {
    var opts = { credentials: 'same-origin' };
    if (data !== undefined) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(data);
    }
    try {
      var res = await fetch(API_URL + '?action=' + action, opts);
      var json = await res.json().catch(function () { return { ok: false, error: 'Unexpected server response. Did you open the site through http://localhost/ ?' }; });
      json.status = res.status;
      return json;
    } catch (e) {
      return { ok: false, error: 'Cannot reach the server. Is XAMPP (Apache + MySQL) running, and are you using http://localhost/ ?' };
    }
  };
})();
