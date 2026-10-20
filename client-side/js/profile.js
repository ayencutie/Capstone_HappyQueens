// View Profile: shows the customer's details and lets them update their name and phone number.
hqOnReady(async function () {
  var $ = function (id) { return document.getElementById(id); };
  var msg = $('profileMsg');
  function say(text, ok) { msg.textContent = text; msg.className = 'form-msg ' + (ok ? 'is-ok' : 'is-error'); }
  function fill(p) {
    $('pfInitials').textContent = ((p.firstName || '?').charAt(0) + (p.lastName || '').charAt(0)).toUpperCase();
    $('pfName').textContent = p.firstName + ' ' + p.lastName;
    $('pfEmail').textContent = p.email;
    $('pfSince').textContent = new Date(p.since + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    $('pfOrders').textContent = p.orders; $('pfOpen').textContent = p.openOrders;
    $('firstName').value = p.firstName; $('lastName').value = p.lastName; $('contactNo').value = p.contactNo; $('emailAddress').value = p.email;
    $('address').value = p.address || ''; $('landmark').value = p.landmark || '';
  }

  var r = await hqApi('profile');
  if (!r.ok) { say(r.error || 'Could not load your profile.', false); return; }
  fill(r.profile);

  $('profileForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('profileSave'); btn.disabled = true;
    var res = await hqApi('update_profile', { firstName: $('firstName').value, lastName: $('lastName').value, contactNo: $('contactNo').value, address: $('address').value, landmark: $('landmark').value });
    btn.disabled = false;
    if (!res.ok) { say(res.error || 'Could not save.', false); return; }
    var again = await hqApi('profile'); if (again.ok) fill(again.profile);
    say('Saved!', true);
  });
});
