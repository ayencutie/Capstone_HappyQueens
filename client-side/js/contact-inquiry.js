// Contact Us > Inquiry Form: the services come from Admin > Services, and the inquiry is saved for the admin.
hqOnReady(async function () {
  var $ = function (id) { return document.getElementById(id); };
  var sel = $('serviceType'), form = $('inquiryForm'), groups = Array.prototype.slice.call(document.querySelectorAll('.service-fields'));
  function key(s) { return String(s).toLowerCase().replace(/[^a-z]/g, ''); }
  // each service name finds its own extra fields (e.g. "Stickers" -> the "sticker" block)
  function groupFor(name) {
    var n = key(name), best = null, len = 0;
    groups.forEach(function (g) { var k = key(g.dataset.service); if (n.indexOf(k) === 0 && k.length > len) { best = g; len = k.length; } });
    return best;
  }

  var r = await hqShop('services');
  sel.innerHTML = '<option value="" disabled selected>Choose a service</option>' +
    (r.ok ? r.services.map(function (s) { return '<option value="' + hqEsc(s.name) + '">' + hqEsc(s.name) + '</option>'; }).join('') : '');
  var want = new URLSearchParams(location.search).get('service');
  if (want) { sel.value = want; }

  function update() { var g = groupFor(sel.value); groups.forEach(function (x) { x.classList.toggle('active', x === g); }); }
  sel.addEventListener('change', update); update();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!sel.value) { alert('Please choose a service.'); return; }
    var g = groupFor(sel.value), lines = [], fd = new FormData();
    if (g) g.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.type === 'file') { Array.prototype.forEach.call(el.files, function (f) { fd.append('files[]', f); }); return; }
      var lab = g.querySelector('label[for="' + el.id + '"]'), v = String(el.value || '').trim();
      if (v) lines.push((lab ? lab.textContent.trim() : el.id) + ': ' + v);
    });
    var notes = $('orderNotes') ? $('orderNotes').value.trim() : '';
    if (notes) lines.push('Notes: ' + notes);
    fd.append('name', $('fullName').value); fd.append('contact', $('contactNumber').value); fd.append('service', sel.value);
    fd.append('qty', $('quantity') ? $('quantity').value : 1); fd.append('details', lines.join('\n'));

    var btn = form.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
    var res = await hqShopUpload('inquiry', fd);
    if (btn) btn.disabled = false;
    if (!res.ok) { alert(res.error || 'Could not send your inquiry.'); return; }
    alert('Thank you! We received your inquiry and will get back to you soon.');
    form.reset(); update();
  });
});
