// Settings: change password, delete account.
hqOnReady(function () {
  var $ = function (id) { return document.getElementById(id); };
  function say(el, text, ok) { el.textContent = text; el.className = 'form-msg ' + (ok ? 'is-ok' : 'is-error'); }

  $('pwForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = $('pwMsg');
    if ($('newPassword').value !== $('confirmPassword').value) { say(msg, 'The new passwords do not match.', false); return; }
    var btn = $('pwSave'); btn.disabled = true;
    var r = await hqApi('change_password', { currentPassword: $('currentPassword').value, newPassword: $('newPassword').value });
    btn.disabled = false;
    if (!r.ok) { say(msg, r.error || 'Could not change your password.', false); return; }
    $('pwForm').reset(); say(msg, 'Your password was updated.', true);
  });

  $('deleteForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = $('deleteMsg');
    if (!$('deletePassword').value) { say(msg, 'Please type your password.', false); return; }
    if (!confirm('Delete your account permanently? This cannot be undone.')) return;
    var btn = $('deleteBtn'); btn.disabled = true;
    var r = await hqApi('delete_account', { password: $('deletePassword').value });
    if (!r.ok) { btn.disabled = false; say(msg, r.error || 'Could not delete the account.', false); return; }
    alert('Your account was deleted. Goodbye!');
    window.location.href = 'index.html';
  });
});
