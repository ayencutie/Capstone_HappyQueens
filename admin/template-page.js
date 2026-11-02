// Admin > Templates: one folder per service that "needs a design/template".
// Add or change services in Admin > Services; the folders here follow automatically.
hqOnReady(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = hqEsc;

  var services = [];      // only services that need templates
  var open = null;        // currently opened folder (service)
  var items = [];

  function sizeText(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function initials(n) { return n.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }

  async function loadFolders() {
    var r = await hqAdmin('services');
    if (!r.ok) { $('folder-grid').innerHTML = '<p>' + esc(r.error || 'Could not load.') + '</p>'; return; }
    services = r.services.filter(function (s) { return s.needsTemplate; });
    $('total-count').textContent = services.reduce(function (n, s) { return n + s.templateCount; }, 0);
    if (open) open = services.find(function (s) { return s.id === open.id; }) || null;
    open ? renderOpen() : renderFolders();
  }

  function renderFolders() {
    var q = $('folder-search').value.trim().toLowerCase();
    var list = services.filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) !== -1; });
    var grid = $('folder-grid');
    if (!list.length) {
      grid.innerHTML = '<p style="color:#87a9a9;grid-column:1/-1;">' + (services.length ? 'No folders match your search.' :
        'No services need templates yet. In Admin &gt; Services, add a service and tick "This service needs a design/template".') + '</p>';
      return;
    }
    grid.innerHTML = list.map(function (s) {
      return '<button type="button" class="folder-card" data-id="' + s.id + '">' +
        '<div class="folder-card-top"><div class="folder-shape">' + esc(initials(s.name)) + '</div><span class="file-count">' + s.templateCount + ' files</span></div>' +
        '<h2>' + esc(s.name) + '</h2><p>' + esc(s.description || (s.occasions.length + ' occasions')) + '</p>' +
        '<div class="folder-footer">Open folder &rarr;</div></button>';
    }).join('');
    grid.querySelectorAll('.folder-card').forEach(function (c) {
      c.addEventListener('click', function () { open = services.find(function (s) { return s.id === parseInt(c.dataset.id, 10); }); renderOpen(); });
    });
  }

  async function renderOpen() {
    $('breadcrumb').hidden = false;
    $('breadcrumb').innerHTML = '<button type="button" id="crumb-home">Template Library</button> / ' + esc(open.name);
    $('crumb-home').addEventListener('click', function () { open = null; showLibrary(); });
    $('page-title').textContent = open.name;
    $('page-description').textContent = 'Designs customers can pick when ordering ' + open.name + '.';
    $('search-wrap').hidden = true;
    $('folder-grid').hidden = true;
    $('template-toolbar').hidden = false;
    $('template-heading').textContent = open.name + ' Templates';
    var sel = $('occasion-select');
    sel.innerHTML = (open.occasions.length ? open.occasions : ['Other']).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('');

    var r = await hqAdmin('templates', undefined, { service_id: open.id });
    items = r.ok ? r.templates : [];
    renderItems();
  }

  function renderItems() {
    $('empty-upload').hidden = items.length > 0;
    $('template-grid').hidden = items.length === 0;
    $('template-grid').innerHTML = items.map(function (t) {
      var prev = t.mime === 'application/pdf' ? '<div class="pdf-preview">PDF</div>' : '<img src="' + esc(hqAsset(t.file)) + '" alt="' + esc(t.name) + '">';
      return '<div class="template-card"><div class="template-preview">' + prev +
        '<button type="button" class="remove-button" data-id="' + t.id + '">Remove</button></div>' +
        '<div class="template-info"><strong>' + esc(t.name) + '</strong><span>' + esc(t.occasion) + ' &middot; ' + sizeText(t.size) + '</span></div></div>';
    }).join('');
    $('template-grid').querySelectorAll('.remove-button').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Remove this template?')) return;
        var r = await hqAdmin('template_delete', { id: parseInt(b.dataset.id, 10) });
        if (!r.ok) return alert(r.error || 'Could not remove.');
        loadFolders();
      });
    });
  }

  function showLibrary() {
    $('breadcrumb').hidden = true;
    $('page-title').textContent = 'Template Library';
    $('page-description').textContent = 'Open a service folder to upload and manage its design templates.';
    $('search-wrap').hidden = false;
    $('folder-grid').hidden = false;
    $('template-toolbar').hidden = true;
    $('empty-upload').hidden = true;
    $('template-grid').hidden = true;
    loadFolders();
  }

  async function upload(files) {
    if (!open || !files.length) return;
    var fd = new FormData();
    fd.append('service_id', open.id);
    fd.append('occasion', $('occasion-select').value);
    Array.prototype.forEach.call(files, function (f) { fd.append('files[]', f); });
    var r = await hqUpload('template_upload', fd);
    if (!r.ok) alert(r.error || 'Upload failed.');
    else if (r.errors && r.errors.length) alert('Uploaded ' + r.saved + ' file(s). Skipped:\n' + r.errors.join('\n'));
    $('file-input').value = '';
    loadFolders();
  }

  $('folder-search').addEventListener('input', renderFolders);
  $('upload-button').addEventListener('click', function () { $('file-input').click(); });
  $('empty-upload-button').addEventListener('click', function () { $('file-input').click(); });
  $('file-input').addEventListener('change', function (e) { upload(e.target.files); });

  loadFolders();
});
