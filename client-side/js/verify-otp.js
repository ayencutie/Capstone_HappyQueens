// Shared by verify-email-otp.html and verify-sms-otp.html (needs api.js first).
document.addEventListener('DOMContentLoaded', async function () {
  const isSms = !!document.getElementById('smsTarget');
  const channel = isSms ? 'sms' : 'email';
  const targetEl = document.getElementById(isSms ? 'smsTarget' : 'emailTarget');
  const digits = document.querySelectorAll('.otp-digit');
  const errorMsg = document.getElementById('otpError');
  const verifyBtn = document.getElementById('verifyBtn');

  // No pending registration on the server -> back to register
  const p = await hqApi('pending');
  if (!p.ok) { window.location.href = 'register.html'; return; }
  targetEl.textContent = isSms ? p.phoneMasked : p.emailMasked;

  function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.add('is-visible'); }

  digits.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '');
      if (input.value && index < digits.length - 1) digits[index + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) digits[index - 1].focus();
    });
    input.addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (!pasted) return;
      e.preventDefault();
      pasted.split('').slice(0, digits.length).forEach((d, i) => { digits[i].value = d; });
      digits[Math.min(pasted.length, digits.length) - 1].focus();
    });
  });

  verifyBtn.addEventListener('click', async function () {
    const code = Array.from(digits).map(d => d.value).join('');
    if (code.length < 6) { showError('Please enter all 6 digits.'); return; }
    errorMsg.classList.remove('is-visible');

    verifyBtn.disabled = true;
    const r = await hqApi('verify_otp', { purpose: 'register', code: code });
    verifyBtn.disabled = false;
    if (!r.ok) { showError(r.error || "That code didn't match."); return; }
    window.location.href = 'register-success.html';
  });

  document.getElementById('resendBtn').addEventListener('click', async function () {
    const r = await hqApi('resend_otp', { purpose: 'register', channel: channel });
    if (r.ok) { digits.forEach(d => d.value = ''); digits[0].focus(); }
    alert(r.ok ? 'A new verification code has been sent.' : (r.error || 'Could not resend the code.'));
  });

  // Switch between email <-> SMS: send a fresh code on the other channel first
  const switchBtn = document.getElementById(isSms ? 'useEmailBtn' : 'useSmsBtn');
  if (switchBtn) switchBtn.addEventListener('click', async function () {
    const other = isSms ? 'email' : 'sms';
    const r = await hqApi('resend_otp', { purpose: 'register', channel: other });
    if (!r.ok && r.status !== 429) { alert(r.error || 'Could not send the code.'); return; }
    window.location.href = isSms ? 'verify-email-otp.html' : 'verify-sms-otp.html';
  });
});
