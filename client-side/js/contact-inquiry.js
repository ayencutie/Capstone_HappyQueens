// Inquiry form (visitors and logged-in customers): service options come from the shop settings.
hqOnReady(async function () {
  var $ = function (id) { return document.getElementById(id); }, esc = hqEsc;
  var form = $('inquiryForm'); if (!form) return;
  var me = await hqApi('me'), member = !!(me && me.ok && me.user && me.user.role === 'customer');

  // logged in: fill in what we know, and allow attachments (visitors cannot attach files)
  if (member) {
    var pr = await hqApi('profile');
    if (pr.ok && pr.profile) {
      $('fullName').value = ((pr.profile.firstName || '') + ' ' + (pr.profile.lastName || '')).trim();
      $('contactNumber').value = pr.profile.contactNo || '';
      $('email').value = pr.profile.email || '';
    }
  } else if ($('fileRow')) {
    $('fileRow').style.display = 'none';
  }

  // services
  var sel = $('serviceType'), svcs = [], byName = {};
  var r = await hqShop('services');
  if (r.ok) {
    svcs = r.services || [];
    sel.innerHTML = '<option value="General question">General question / not sure yet</option>' +
      svcs.map(function (s) { byName[s.name] = s; return '<option value="' + esc(s.name) + '" data-id="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
  }
  var want = new URLSearchParams(location.search).get('service');
  if (want) {
    var hit = svcs.filter(function (s) { return String(s.id) === want || s.name.toLowerCase() === want.toLowerCase(); })[0];
    if (hit) sel.value = hit.name;
  }

  async function showOptions() {
    var box = $('optionFields'), hint = $('serviceHint'), s = byName[sel.value];
    box.innerHTML = ''; hint.textContent = '';
    if (!s) return;
    hint.textContent = (s.description || '') + (s.priceText ? ' \u00B7 ' + s.priceText : '');
    var d = await hqShop('service', undefined, { id: s.id });
    if (!d.ok || sel.value !== s.name) return;
    box.innerHTML = (d.service.choices || []).map(function (g, gi) {
      return '<div class="pg-field"><label for="opt' + gi + '">' + esc(g.name) + '</label><select id="opt' + gi + '" data-group="' + esc(g.name) + '"><option value="">Not sure yet</option>' +
        g.options.map(function (o) { return '<option value="' + esc(o.name) + '">' + esc(o.name) + (g.role === 'size' && o.w > 0 ? ' (' + Number(o.w.toFixed ? o.w.toFixed(1) : o.w) + ' \u00D7 ' + Number(o.h.toFixed ? o.h.toFixed(1) : o.h) + ' ' + esc(g.unit || 'mm') + ')' : '') + '</option>'; }).join('') +
        '</select></div>';
    }).join('');
  }
  sel.addEventListener('change', showOptions);
  showOptions();

  function error(msg) { var s = $('formStatus'); s.textContent = msg; s.className = 'pg-status is-error'; s.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    $('formStatus').className = 'pg-status';
    var name = $('fullName').value.trim(), phone = $('contactNumber').value.replace(/[\s-]/g, ''), email = $('email').value.trim(), msg = $('details').value.trim();
    if (name.length < 2) return error('Please enter your name.');
    if (!/^(09|\+639)\d{9}$/.test(phone)) return error('Please enter a valid mobile number (09XX XXX XXXX).');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('Please enter a valid email address.');
    if (msg.length < 5) return error('Please tell us a little about what you need.');

    var lines = [];
    $('optionFields').querySelectorAll('select').forEach(function (o) { if (o.value) lines.push(o.dataset.group + ': ' + o.value); });
    if ($('neededBy').value) lines.push('Needed by: ' + $('neededBy').value);
    lines.push(''); lines.push(msg);

    var fd = new FormData();
    fd.append('name', name); fd.append('contact', phone); fd.append('email', email);
    fd.append('service', sel.value); fd.append('qty', Math.max(1, parseInt($('quantity').value, 10) || 1));
    fd.append('details', lines.join('\n').trim()); fd.append('website', $('website').value);
    if (member && $('files') && $('files').files.length) Array.prototype.slice.call($('files').files, 0, 5).forEach(function (f) { fd.append('files[]', f); });

    var btn = $('submitBtn'); btn.disabled = true; var label = btn.innerHTML; btn.innerHTML = 'Sending\u2026';
    var res = await hqShopUpload('inquiry', fd);
    btn.disabled = false; btn.innerHTML = label;
    if (!res.ok) return error(res.error || 'We could not send your inquiry. Please try again.');
    form.style.display = 'none'; $('formHead').style.display = 'none'; $('successPanel').style.display = 'block'; $('successPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  var again = $('sendAnother');
  if (again) again.addEventListener('click', function () { form.reset(); form.style.display = ''; $('formHead').style.display = ''; $('successPanel').style.display = 'none'; showOptions(); });
});
