// Forgot Password — email OTP flow (needs api.js loaded first)

document.addEventListener('DOMContentLoaded', function () {
  const recoveryEmail = document.getElementById('recoveryEmail');
  const requestForm = document.getElementById('requestForm');
  const requestError = document.getElementById('requestError');

  const stepRequest = document.getElementById('stepRequest');
  const stepOtp = document.getElementById('stepOtp');
  const otpTarget = document.getElementById('otpTarget');
  const otpForm = document.getElementById('otpForm');
  const otpInputs = document.querySelectorAll('#otpInputs input');
  const otpError = document.getElementById('otpError');
  const resendBtn = document.getElementById('resendCodeBtn');
  const changeMethodBtn = document.getElementById('changeMethodBtn');

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  function showError(message) {
    requestError.textContent = message;
    requestError.classList.add('is-visible');
  }

  function maskEmail(value) {
    const [name, domain] = value.split('@');
    if (!name || !domain) return value;
    const visible = name.slice(0, Math.min(2, name.length));
    return visible + '*'.repeat(Math.max(name.length - visible.length, 1)) + '@' + domain;
  }

  requestForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    requestError.classList.remove('is-visible');

    const value = recoveryEmail.value.trim();
    if (!isValidEmail(value)) {
      showError('Please enter a valid email address.');
      return;
    }

    const sendBtn = requestForm.querySelector('button[type="submit"]');
    sendBtn.disabled = true;
    const r = await hqApi('forgot', { method: 'email', value: value });
    sendBtn.disabled = false;
    if (!r.ok) { showError(r.error || 'Something went wrong. Please try again.'); return; }

    otpTarget.textContent = maskEmail(value);
    stepRequest.style.display = 'none';
    stepOtp.style.display = '';
    otpError.classList.remove('is-visible');
    otpInputs.forEach((input) => (input.value = ''));
    otpInputs[0].focus();
  });

  // OTP auto-advance between boxes
  otpInputs.forEach((input, index) => {
    input.addEventListener('input', function () {
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (this.value && index < otpInputs.length - 1) otpInputs[index + 1].focus();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !this.value && index > 0) otpInputs[index - 1].focus();
    });

    input.addEventListener('paste', function (e) {
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      if (!pasted) return;
      e.preventDefault();
      pasted.split('').slice(0, otpInputs.length).forEach((digit, i) => { otpInputs[i].value = digit; });
      const nextEmpty = Array.from(otpInputs).find((i) => !i.value);
      (nextEmpty || otpInputs[otpInputs.length - 1]).focus();
    });
  });

  otpForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const code = Array.from(otpInputs).map((i) => i.value).join('');

    if (code.length < 6) {
      otpError.textContent = 'Please enter all 6 digits.';
      otpError.classList.add('is-visible');
      return;
    }

    const r = await hqApi('verify_otp', { purpose: 'reset', code: code });
    if (!r.ok) {
      otpError.textContent = r.error || "That code didn't match. Please try again.";
      otpError.classList.add('is-visible');
      return;
    }
    otpError.classList.remove('is-visible');
    window.location.href = 'reset-password.html';
  });

  resendBtn.addEventListener('click', async function () {
    otpInputs.forEach((input) => (input.value = ''));
    otpInputs[0].focus();
    otpError.classList.remove('is-visible');
    const r = await hqApi('resend_otp', { purpose: 'reset' });
    alert(r.ok ? 'A new code has been sent.' : (r.error || 'Could not resend the code.'));
  });

  changeMethodBtn.addEventListener('click', function () {
    stepOtp.style.display = 'none';
    stepRequest.style.display = '';
  });
});
