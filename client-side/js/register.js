// Register page (replaces the inline <script> in register.html; needs api.js first)
document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('registerForm');
  const googleBtn = document.getElementById('googleBtn');
  const agreeTerms = document.getElementById('agreeTerms');
  const submitBtn = document.getElementById('submitBtn');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const data = {
      firstName: document.getElementById('firstName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      contactNo: document.getElementById('contactNo').value.trim(),
      email: document.getElementById('emailAddress').value.trim(),
      password: document.getElementById('registerPassword').value
    };

    if (!data.firstName || !data.lastName || !data.contactNo || !data.email || !data.password) {
      alert('Please fill out all fields first.');
      return;
    }
    if (data.password !== document.getElementById('registerConfirm').value) {
      alert('Passwords do not match.');
      return;
    }
    if (!agreeTerms.checked) {
      alert('Please check that you accept the Terms & Conditions and Privacy Policy.');
      return;
    }

    submitBtn.disabled = true;
    const r = await hqApi('register', data);
    submitBtn.disabled = false;
    if (!r.ok) { alert(r.error || 'Could not create your account.'); return; }
    window.location.href = 'verify-email-otp.html';
  });

  googleBtn.addEventListener('click', async function () {
    if (!agreeTerms.checked) {
      alert('Please check that you accept the Terms & Conditions and Privacy Policy before continuing with Google.');
      return;
    }
    const r = await hqApi('google', {});
    alert(r.error || 'Google sign-up is not available yet.');
  });
});
