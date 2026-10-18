// Adds a "show / hide password" eye button to every password box on the page.
// (The Reset Password page already has its own eye buttons, so those are left alone.)
(function () {
  var EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  var css = document.createElement('style');
  css.textContent =
    '.pw-field{position:relative}' +
    '.pw-eye{position:absolute;top:50%;right:6px;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;color:#4C7C87;background:none;border:none;border-radius:50%;cursor:pointer}' +
    '.pw-eye:hover{color:#1E5761;background:rgba(99,163,177,.15)}' +
    '.pw-eye:focus-visible{outline:2px solid #63A3B1}' +
    'input.has-pw-eye{padding-right:44px !important}';
  document.head.appendChild(css);

  function enhance(input) {
    if (input.dataset.pwEye) return;
    input.dataset.pwEye = '1';
    var wrap = input.closest('.input-wrap');
    if (wrap && wrap.querySelector('.pw-toggle')) return;          // has its own eye (Reset Password page)
    if (!wrap) {
      wrap = document.createElement('div'); wrap.className = 'pw-field';
      input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    }
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pw-eye'; btn.setAttribute('aria-label', 'Show password'); btn.innerHTML = EYE;
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? EYE_OFF : EYE;
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      input.focus();
    });
    input.classList.add('has-pw-eye');
    wrap.appendChild(btn);
  }

  function run() { document.querySelectorAll('input[type="password"]').forEach(enhance); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
