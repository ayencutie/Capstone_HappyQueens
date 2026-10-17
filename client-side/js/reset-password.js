// Reset Password — new password + confirm, with live requirement checks
// (front-end demo only, no real backend)

document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('resetForm');
  const newPassword = document.getElementById('newPassword');
  const confirmPassword = document.getElementById('confirmPassword');
  const submitBtn = document.getElementById('resetSubmitBtn');
  const matchError = document.getElementById('matchError');
  const requirementItems = document.querySelectorAll('#pwRequirements li');
  const stepReset = document.getElementById('stepReset');
  const stepSuccess = document.getElementById('stepSuccess');

  const rules = {
    length: (value) => value.length >= 8,
    upper: (value) => /[A-Z]/.test(value),
    lower: (value) => /[a-z]/.test(value),
    number: (value) => /[0-9]/.test(value),
  };

  function checkRequirements() {
    const value = newPassword.value;
    let allMet = true;

    requirementItems.forEach((item) => {
      const rule = item.getAttribute('data-rule');
      const met = rules[rule](value);
      item.classList.toggle('is-met', met);
      if (!met) allMet = false;
    });

    return allMet;
  }

  function checkMatch() {
    const matches = newPassword.value.length > 0 && newPassword.value === confirmPassword.value;
    const shouldWarn = confirmPassword.value.length > 0 && !matches;
    matchError.style.display = shouldWarn ? '' : 'none';
    return matches;
  }

  function updateSubmitState() {
    const requirementsMet = checkRequirements();
    const passwordsMatch = checkMatch();
    submitBtn.disabled = !(requirementsMet && passwordsMatch);
  }

  newPassword.addEventListener('input', updateSubmitState);
  confirmPassword.addEventListener('input', updateSubmitState);

  // Show/hide password toggles
  document.querySelectorAll('.pw-toggle').forEach((btn) => {
    btn.addEventListener('click', function () {
      const targetId = this.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const icon = this.querySelector('i');
      const isVisible = input.type === 'text';

      input.type = isVisible ? 'password' : 'text';
      input.classList.toggle('pw-visible', !isVisible);
      icon.classList.toggle('fa-eye', isVisible);
      icon.classList.toggle('fa-eye-slash', !isVisible);
      this.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
    });
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    updateSubmitState();
    if (submitBtn.disabled) return;

    submitBtn.disabled = true;
    const r = await hqApi('reset', { password: newPassword.value });
    if (!r.ok) {
      submitBtn.disabled = false;
      matchError.textContent = r.error || 'Could not reset your password.';
      matchError.style.display = '';
      return;
    }

    stepReset.style.display = 'none';
    stepSuccess.style.display = '';
  });
});
