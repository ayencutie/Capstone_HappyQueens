// Admin > Services: catalog, templates (designs), choices, settings. Everything is saved in MySQL.
hqOnReady(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = hqEsc;

  var services = [];
  var current = null;          // service being managed
  var templates = [];          // templates of the current service
  var activeOccasion = '';
  var activeTab = 'templates';
  var occasionsTarget = 'detail'; // which chip list the Occasions modal edits
  var newOccasions = [];
  var newImageFile = null;
  var saveTimer = null;

  // ---------- small helpers ----------
  function priceHtml(p) {
    p = (p || '').trim();
    if (!p) return '<span>No price set</span>';
    return /\d/.test(p) ? '&#8369;' + esc(p) + '<span> / pc</span>' : esc(p);
  }
  function toast(msg) { alert(msg); }
  function openModal(id) { $(id).classList.add('is-open'); }
  function closeModal(id) { $(id).classList.remove('is-open'); }
  function byId(id) { return services.find(function (s) { return s.id === id; }); }

  async function loadServices() {
    var r = await hqAdmin('services');
    if (!r.ok) { $('servicesCardGrid').innerHTML = '<div class="admin-option-groups-empty">' + esc(r.error || 'Could not load services.') + '</div>'; return; }
    services = r.services;
    renderCards();
    if (current) { current = byId(current.id); if (current) renderDetail(); else showList(); }
  }

  // ---------- list ----------
  function renderCards() {
    var grid = $('servicesCardGrid');
    if (!services.length) { grid.innerHTML = '<div class="admin-option-groups-empty" style="grid-column:1/-1;">No services yet. Click "Add Service" to create your first one.</div>'; return; }
    grid.innerHTML = services.map(function (s) {
      var img = s.image
        ? '<div class="admin-service-card-image" style="background-image:url(\'' + esc(hqAsset(s.image)) + '\')">'
        : '<div class="admin-service-card-image"><i class="fa-solid fa-image admin-service-card-image-noimg"></i>';
      return '<div class="admin-service-card">' + img +
          '<span class="admin-service-status ' + (s.isActive ? 'is-active' : 'is-inactive') + '">' + (s.isActive ? 'Active' : 'Hidden') + '</span></div>' +
        '<div class="admin-service-card-body">' +
          '<span class="admin-service-card-category">' + (s.needsTemplate ? 'Design service' : 'Options only') + (s.previewMode === '3d' ? ' \u00B7 3D' : '') + '</span>' +
          '<h3>' + esc(s.name) + '</h3>' +
          '<div class="admin-service-card-price">' + priceHtml(s.priceText) + '</div></div>' +
        '<div class="admin-service-card-footer">' +
          '<div class="admin-service-template-count"><i class="fa-solid fa-images"></i> ' + (s.needsTemplate ? s.templateCount + ' templates' : 'No templates') + '</div>' +
          '<div class="admin-service-card-actions"><button type="button" class="btn btn-outline" data-manage="' + s.id + '" style="padding:6px 14px;font-size:12.5px;">Manage</button></div>' +
        '</div></div>';
    }).join('');
    grid.querySelectorAll('[data-manage]').forEach(function (b) {
      b.addEventListener('click', function () { openDetail(parseInt(b.dataset.manage, 10)); });
    });
  }

  function showList() {
    current = null;
    $('serviceDetailView').style.display = 'none';
    $('servicesListPanel').style.display = '';
    $('adminPageTitle').textContent = 'Services';
  }

  // ---------- detail ----------
  async function openDetail(id) {
    current = byId(id);
    if (!current) return;
    activeOccasion = current.occasions[0] || 'Other';
    activeTab = current.needsTemplate ? 'templates' : 'choices';
    $('servicesListPanel').style.display = 'none';
    $('serviceDetailView').style.display = '';
    renderDetail();
    loadTemplates();
  }

  function renderDetail() {
    var s = current;
    $('detailServiceName').textContent = s.name;
    $('detailServiceCategory').textContent = s.needsTemplate ? 'DESIGN SERVICE' : 'OPTIONS ONLY';
    $('detailServicePrice').innerHTML = priceHtml(s.priceText);
    $('detailTabBtnTemplates').style.display = s.needsTemplate ? '' : 'none';
    $('detailTabTemplatesCount').textContent = '(' + s.templateCount + ')';
    $('detailTabChoicesCount').textContent = '(' + s.choices.length + ')';
    $('detailSettingsName').value = s.name;
    $('detailSettingsPrice').value = s.priceText;
    $('detailSettingsDesc').value = s.description;
    $('detailSettingsOrderUrl').value = s.orderUrl;
    $('detailSettingsNeedsTemplate').checked = s.needsTemplate;
    $('detailSettingsActive').checked = s.isActive;
    $('detailSettingsPreview').value = s.previewMode;
    $('detailSettingsShapeNoFold').checked = s.shapes.indexOf('no-fold') !== -1;
    $('detailSettingsShapeTwoFold').checked = s.shapes.indexOf('two-fold') !== -1;
    $('detailSettingsShapesWrap').style.display = s.previewMode === '3d' ? '' : 'none';
    $('detailSettingsRatioW').value = s.ratioW; $('detailSettingsRatioH').value = s.ratioH;
    $('detailSettingsTextPos').value = s.textPosition;
    $('detailSettingsAI').checked = s.aiEnabled; $('detailSettingsUpload').checked = s.uploadEnabled;
    $('detailSettingsNeedsInfo').checked = s.needsInfo;
    $('detailSettingsProduct').value = s.productType;
    ['Circle', 'Triangle', 'Square', 'Heart', 'Photo'].forEach(function (n) { $('detailSettingsCut' + n).checked = s.cutShapes.indexOf(n.toLowerCase()) !== -1; });
    $('detailSettingsCutHole').checked = s.cutHole;
    $('detailTabBtnInfo').style.display = s.needsInfo ? '' : 'none';
    if (!s.needsInfo && activeTab === 'info') activeTab = s.needsTemplate ? 'templates' : 'choices';
    $('detailTabInfoCount').textContent = '(' + s.infoFields.length + ')';
    $('detailSettingsImagePreview').innerHTML = s.image ? '<img src="' + esc(hqAsset(s.image)) + '" alt="">' : '<i class="fa-solid fa-image"></i>';
    if (!s.needsTemplate && activeTab === 'templates') activeTab = 'choices';
    if (s.occasions.indexOf(activeOccasion) === -1) activeOccasion = s.occasions[0] || 'Other';
    showTab(activeTab);
    renderOccasionTabs();
    renderChoices();
    renderInfoFields();
  }

  function showTab(name) {
    activeTab = name;
    ['templates', 'choices', 'info', 'settings'].forEach(function (t) {
      $('detailPanel' + t.charAt(0).toUpperCase() + t.slice(1)).style.display = t === name ? '' : 'none';
    });
    document.querySelectorAll('[data-detail-tab]').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.detailTab === name);
    });
  }

  // ---------- templates ----------
  async function loadTemplates() {
    var r = await hqAdmin('templates', undefined, { service_id: current.id });
    templates = r.ok ? r.templates : [];
    current.templateCount = templates.length;
    $('detailTabTemplatesCount').textContent = '(' + templates.length + ')';
    renderTemplates();
  }

  function renderOccasionTabs() {
    var list = current.occasions.length ? current.occasions : ['Other'];
    $('detailOccasionTabs').innerHTML = list.map(function (o) {
      var n = templates.filter(function (t) { return t.occasion === o; }).length;
      return '<button type="button" class="admin-occasion-tab' + (o === activeOccasion ? ' is-active' : '') + '" data-occ="' + esc(o) + '">' + esc(o) + ' (' + n + ')</button>';
    }).join('');
    $('detailOccasionTabs').querySelectorAll('[data-occ]').forEach(function (b) {
      b.addEventListener('click', function () { activeOccasion = b.dataset.occ; renderOccasionTabs(); renderTemplates(); });
    });
    $('detailDropzone').querySelector('.admin-dropzone-title').textContent = 'Drop design files here (' + activeOccasion + ')';
  }

  function renderTemplates() {
    renderOccasionTabs();
    var items = templates.filter(function (t) { return t.occasion === activeOccasion; });
    var grid = $('detailTemplateGrid');
    if (!items.length) { grid.innerHTML = '<div class="admin-option-groups-empty" style="grid-column:1/-1;">No designs under "' + esc(activeOccasion) + '" yet.</div>'; return; }
    grid.innerHTML = items.map(function (t) {
      var thumb = t.mime === 'application/pdf'
        ? '<div class="admin-detail-template-thumb admin-detail-template-thumb-pdf"><i class="fa-solid fa-file-pdf"></i></div>'
        : '<div class="admin-detail-template-thumb" style="background-image:url(\'' + esc(hqAsset(t.file)) + '\')"></div>';
      return '<div class="admin-detail-template-item">' + thumb +
        '<div class="admin-detail-template-body"><span class="admin-detail-template-occasion">' + esc(t.occasion) + '</span>' +
        '<div class="admin-detail-template-name">' + esc(t.name) + '</div></div>' +
        '<div class="admin-detail-template-footer"><button type="button" class="admin-link-btn is-danger" data-del-tpl="' + t.id + '">Delete</button></div></div>';
    }).join('');
    grid.querySelectorAll('[data-del-tpl]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Delete this design?')) return;
        var r = await hqAdmin('template_delete', { id: parseInt(b.dataset.delTpl, 10) });
        if (!r.ok) return toast(r.error || 'Could not delete.');
        loadTemplates(); loadServices();
      });
    });
  }

  async function uploadFiles(fileList) {
    if (!fileList || !fileList.length) return;
    var fd = new FormData();
    fd.append('service_id', current.id);
    fd.append('occasion', activeOccasion);
    Array.prototype.forEach.call(fileList, function (f) { fd.append('files[]', f); });
    var r = await hqUpload('template_upload', fd);
    if (!r.ok) toast(r.error || 'Upload failed.');
    else if (r.errors && r.errors.length) toast('Uploaded ' + r.saved + ' file(s). Skipped:\n' + r.errors.join('\n'));
    $('detailFileInput').value = '';
    loadTemplates(); loadServices();
  }

  // ---------- choices (option groups) ----------
  function saveChoicesSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async function () {
      var r = await hqAdmin('service_save', serviceToPayload(current));
      if (!r.ok) toast(r.error || 'Could not save choices.');
    }, 500);
  }

  function renderChoices() {
    var box = $('optionGroupsList');
    var groups = current.choices;
    $('detailTabChoicesCount').textContent = '(' + groups.length + ')';
    if (!groups.length) { box.innerHTML = '<div class="admin-option-groups-empty">No options yet. Add a group such as "Size" or "Finish".</div>'; return; }
    box.innerHTML = groups.map(function (g, gi) {
      return '<div class="admin-option-group" data-g="' + gi + '">' +
        '<div class="admin-option-group-header">' +
          '<input type="text" class="admin-option-group-name" data-f="gname" value="' + esc(g.name) + '">' +
          '<div class="admin-option-group-header-actions">' +
            '<label class="admin-required-toggle"><input type="checkbox" data-f="req"' + (g.required ? ' checked' : '') + '> Required</label>' +
            '<button type="button" class="admin-link-btn is-danger" data-f="delg">Delete group</button>' +
          '</div></div>' +
        '<div class="admin-option-rows">' + g.options.map(function (o, oi) {
          return '<div class="admin-option-row" data-o="' + oi + '"><span class="admin-option-dot"></span>' +
            '<input type="text" class="admin-option-name-input" data-f="oname" value="' + esc(o.name) + '" placeholder="Option name">' +
            '<span class="admin-option-price">+&#8369;<input type="number" min="0" step="0.01" data-f="oprice" value="' + esc(o.price) + '"></span>' +
            '<button type="button" class="admin-link-btn is-danger" data-f="delo" style="margin:0;">Remove</button></div>';
        }).join('') + '</div>' +
        '<button type="button" class="admin-link-btn" data-f="addo">+ Add option</button></div>';
    }).join('');

    box.querySelectorAll('.admin-option-group').forEach(function (el) {
      var g = groups[parseInt(el.dataset.g, 10)];
      el.querySelector('[data-f="gname"]').addEventListener('input', function (e) { g.name = e.target.value; saveChoicesSoon(); });
      el.querySelector('[data-f="req"]').addEventListener('change', function (e) { g.required = e.target.checked; saveChoicesSoon(); });
      el.querySelector('[data-f="delg"]').addEventListener('click', function () {
        if (!confirm('Delete the group "' + g.name + '"?')) return;
        groups.splice(groups.indexOf(g), 1); renderChoices(); saveChoicesSoon();
      });
      el.querySelector('[data-f="addo"]').addEventListener('click', function () {
        g.options.push({ name: '', price: 0 }); renderChoices(); saveChoicesSoon();
      });
      el.querySelectorAll('.admin-option-row').forEach(function (row) {
        var o = g.options[parseInt(row.dataset.o, 10)];
        row.querySelector('[data-f="oname"]').addEventListener('input', function (e) { o.name = e.target.value; saveChoicesSoon(); });
        row.querySelector('[data-f="oprice"]').addEventListener('input', function (e) { o.price = parseFloat(e.target.value) || 0; saveChoicesSoon(); });
        row.querySelector('[data-f="delo"]').addEventListener('click', function () {
          g.options.splice(g.options.indexOf(o), 1); renderChoices(); saveChoicesSoon();
        });
      });
    });
  }

  function renderInfoFields() {
    var box = $('infoFieldsList'), list = current.infoFields;
    $('detailTabInfoCount').textContent = '(' + list.length + ')';
    if (!list.length) { box.innerHTML = '<div class="admin-option-groups-empty">No info fields. Customers will not be asked to type anything (good for things like a plain photo print).</div>'; return; }
    var types = { text: 'Short text', textarea: 'Long text', date: 'Date', time: 'Time' };
    box.innerHTML = list.map(function (f, i) {
      return '<div class="admin-option-group" data-i="' + i + '"><div class="admin-option-group-header">' +
        '<input type="text" class="admin-option-group-name" data-f="label" value="' + esc(f.label) + '" placeholder="e.g. Venue / Address">' +
        '<div class="admin-option-group-header-actions">' +
          '<select data-f="type">' + Object.keys(types).map(function (k) { return '<option value="' + k + '"' + (k === f.type ? ' selected' : '') + '>' + types[k] + '</option>'; }).join('') + '</select>' +
          '<label class="admin-required-toggle"><input type="checkbox" data-f="req"' + (f.required ? ' checked' : '') + '> Required</label>' +
          (i > 0 ? '<button type="button" class="admin-link-btn" data-f="up">&uarr;</button>' : '') +
          '<button type="button" class="admin-link-btn is-danger" data-f="del">Remove</button>' +
        '</div></div></div>';
    }).join('');
    box.querySelectorAll('.admin-option-group').forEach(function (el) {
      var f = list[parseInt(el.dataset.i, 10)];
      el.querySelector('[data-f="label"]').addEventListener('input', function (e) { f.label = e.target.value; saveChoicesSoon(); });
      el.querySelector('[data-f="type"]').addEventListener('change', function (e) { f.type = e.target.value; saveChoicesSoon(); });
      el.querySelector('[data-f="req"]').addEventListener('change', function (e) { f.required = e.target.checked; saveChoicesSoon(); });
      el.querySelector('[data-f="del"]').addEventListener('click', function () { list.splice(list.indexOf(f), 1); renderInfoFields(); saveChoicesSoon(); });
      var up = el.querySelector('[data-f="up"]');
      if (up) up.addEventListener('click', function () { var i = list.indexOf(f); list.splice(i, 1); list.splice(i - 1, 0, f); renderInfoFields(); saveChoicesSoon(); });
    });
  }

  function serviceToPayload(s) {
    return { id: s.id, name: s.name, description: s.description, priceText: s.priceText, orderUrl: s.orderUrl,
             needsTemplate: s.needsTemplate, isActive: s.isActive, occasions: s.occasions, choices: s.choices,
             previewMode: s.previewMode, shapes: s.shapes, ratioW: s.ratioW, ratioH: s.ratioH, textPosition: s.textPosition,
             aiEnabled: s.aiEnabled, uploadEnabled: s.uploadEnabled, infoFields: s.infoFields, needsInfo: s.needsInfo, cutShapes: s.cutShapes, cutHole: s.cutHole, productType: s.productType };
  }

  // ---------- chips (occasions) ----------
  function renderChips(el, list, onRemove) {
    el.innerHTML = list.length ? list.map(function (o, i) {
      return '<span class="admin-chip">' + esc(o) + '<button type="button" class="admin-chip-remove" data-i="' + i + '" aria-label="Remove">&times;</button></span>';
    }).join('') : '<span class="admin-chip-empty">None yet</span>';
    el.querySelectorAll('[data-i]').forEach(function (b) { b.addEventListener('click', function () { onRemove(parseInt(b.dataset.i, 10)); }); });
  }

  function openOccasionsModal() {
    occasionsTarget = 'detail';
    $('occasionsModalSub').textContent = 'Designs for "' + current.name + '" are filed under these. Removing one does not delete its files.';
    renderChips($('occasionsChipList'), current.occasions, function (i) { current.occasions.splice(i, 1); openOccasionsRefresh(); });
    openModal('occasionsModal');
  }
  function openOccasionsRefresh() { renderChips($('occasionsChipList'), current.occasions, function (i) { current.occasions.splice(i, 1); openOccasionsRefresh(); }); }

  function shapesFrom(prefix) {
    var out = [];
    if ($(prefix + 'ShapeNoFold').checked) out.push('no-fold');
    if ($(prefix + 'ShapeTwoFold').checked) out.push('two-fold');
    return out.length ? out : ['no-fold'];
  }

  // ---------- add service modal ----------
  function resetAddModal() {
    ['newServiceName', 'newServicePrice', 'newServiceDesc', 'newServiceOrderUrl', 'newServiceOccasionInput'].forEach(function (id) { $(id).value = ''; });
    $('newServiceNeedsTemplate').checked = true;
    $('newServicePreview').value = 'flat'; $('newServiceShapesWrap').style.display = 'none';
    $('newServiceShapeNoFold').checked = true; $('newServiceShapeTwoFold').checked = false;
    $('newServiceRatioW').value = 5; $('newServiceRatioH').value = 7; $('newServiceNeedsInfo').checked = true; $('newServiceProduct').value = 'paper';
    $('newServiceImagePreview').innerHTML = '<i class="fa-solid fa-image"></i>';
    newImageFile = null; newOccasions = [];
    $('newServiceOccasionsWrapper').style.display = '';
    renderChips($('newServiceOccasionsChipList'), newOccasions, removeNewOcc);
  }
  function removeNewOcc(i) { newOccasions.splice(i, 1); renderChips($('newServiceOccasionsChipList'), newOccasions, removeNewOcc); }

  // ---------- wire up the page ----------
  var sidebar = $('adminSidebar'), toggle = $('adminSidebarToggle');
  if (sidebar && toggle) toggle.addEventListener('click', function () { sidebar.classList.toggle('is-open'); });

  $('detailBackLink').addEventListener('click', function (e) { e.preventDefault(); showList(); loadServices(); });
  document.querySelectorAll('[data-detail-tab]').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.detailTab); }); });

  // templates
  $('detailBrowseFilesBtn').addEventListener('click', function () { $('detailFileInput').click(); });
  $('detailUploadDesignsBtn').addEventListener('click', function () { $('detailFileInput').click(); });
  $('detailFileInput').addEventListener('change', function (e) { uploadFiles(e.target.files); });
  var dz = $('detailDropzone');
  ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-dragover'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-dragover'); }); });
  dz.addEventListener('drop', function (e) { uploadFiles(e.dataTransfer.files); });

  // preview type -> show the 3D shapes only when it's 3D
  $('newServicePreview').addEventListener('change', function (e) { $('newServiceShapesWrap').style.display = e.target.value === '3d' ? '' : 'none'; });
  $('detailSettingsPreview').addEventListener('change', function (e) { $('detailSettingsShapesWrap').style.display = e.target.value === '3d' ? '' : 'none'; });
  // info fields
  $('addInfoFieldBtn').addEventListener('click', function () {
    current.infoFields.push({ label: '', type: 'text', required: false });
    renderInfoFields(); saveChoicesSoon();
  });

  // choices
  $('addOptionGroupBtn').addEventListener('click', function () {
    current.choices.push({ name: 'New group', required: false, options: [{ name: '', price: 0 }] });
    renderChoices(); saveChoicesSoon();
  });

  // occasions modal (for an existing service)
  $('detailManageOccasionsBtn').addEventListener('click', openOccasionsModal);
  $('addOccasionBtn').addEventListener('click', function () {
    var v = $('newOccasionInput').value.trim();
    if (v && current.occasions.indexOf(v) === -1) current.occasions.push(v);
    $('newOccasionInput').value = '';
    openOccasionsRefresh();
  });
  $('newOccasionInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('addOccasionBtn').click(); } });
  function closeOccasions() {
    closeModal('occasionsModal');
    if (current) hqAdmin('service_save', serviceToPayload(current)).then(function () { loadServices(); });
  }
  $('occasionsModalDone').addEventListener('click', closeOccasions);
  $('occasionsModalClose').addEventListener('click', closeOccasions);

  // settings
  $('detailSettingsImageBtn').addEventListener('click', function () { $('detailSettingsImageInput').click(); });
  $('detailSettingsImageInput').addEventListener('change', async function (e) {
    if (!e.target.files[0]) return;
    var fd = new FormData(); fd.append('id', current.id); fd.append('image', e.target.files[0]);
    var r = await hqUpload('service_image', fd);
    e.target.value = '';
    if (!r.ok) return toast(r.error || 'Could not upload the photo.');
    loadServices();
  });
  $('detailSettingsSaveBtn').addEventListener('click', async function () {
    var name = $('detailSettingsName').value.trim();
    if (!name) return toast('Please enter a service name.');
    current.name = name;
    current.priceText = $('detailSettingsPrice').value.trim();
    current.description = $('detailSettingsDesc').value.trim();
    current.orderUrl = $('detailSettingsOrderUrl').value.trim();
    current.needsTemplate = $('detailSettingsNeedsTemplate').checked;
    current.isActive = $('detailSettingsActive').checked;
    current.previewMode = $('detailSettingsPreview').value;
    current.shapes = shapesFrom('detailSettings');
    current.ratioW = parseFloat($('detailSettingsRatioW').value) || 5; current.ratioH = parseFloat($('detailSettingsRatioH').value) || 7;
    current.textPosition = $('detailSettingsTextPos').value;
    current.aiEnabled = $('detailSettingsAI').checked; current.uploadEnabled = $('detailSettingsUpload').checked;
    current.needsInfo = $('detailSettingsNeedsInfo').checked;
    current.productType = $('detailSettingsProduct').value;
    current.cutShapes = ['Circle', 'Triangle', 'Square', 'Heart', 'Photo'].filter(function (n) { return $('detailSettingsCut' + n).checked; }).map(function (n) { return n.toLowerCase(); });
    current.cutHole = $('detailSettingsCutHole').checked;
    var r = await hqAdmin('service_save', serviceToPayload(current));
    if (!r.ok) return toast(r.error || 'Could not save.');
    toast('Saved! The website is updated.');
    loadServices();
  });
  $('detailDeleteServiceBtn').addEventListener('click', async function () {
    if (!confirm('Delete "' + current.name + '" and all of its templates? This cannot be undone.')) return;
    var r = await hqAdmin('service_delete', { id: current.id });
    if (!r.ok) return toast(r.error || 'Could not delete.');
    showList(); loadServices();
  });

  // add service
  $('addServiceBtn').addEventListener('click', function () { resetAddModal(); openModal('addServiceModal'); });
  ['addServiceModalClose', 'addServiceCancel'].forEach(function (id) { $(id).addEventListener('click', function () { closeModal('addServiceModal'); }); });
  $('newServiceNeedsTemplate').addEventListener('change', function (e) { $('newServiceOccasionsWrapper').style.display = e.target.checked ? '' : 'none'; });
  $('addNewServiceOccasionBtn').addEventListener('click', function () {
    var v = $('newServiceOccasionInput').value.trim();
    if (v && newOccasions.indexOf(v) === -1) newOccasions.push(v);
    $('newServiceOccasionInput').value = '';
    renderChips($('newServiceOccasionsChipList'), newOccasions, removeNewOcc);
  });
  $('newServiceImageBtn').addEventListener('click', function () { $('newServiceImageInput').click(); });
  $('newServiceImageInput').addEventListener('change', function (e) {
    newImageFile = e.target.files[0] || null;
    if (newImageFile) $('newServiceImagePreview').innerHTML = '<img src="' + URL.createObjectURL(newImageFile) + '" alt="">';
  });
  $('addServiceSubmit').addEventListener('click', async function () {
    var name = $('newServiceName').value.trim();
    if (!name) return toast('Please enter a service name.');
    var btn = $('addServiceSubmit'); btn.disabled = true;
    var r = await hqAdmin('service_save', {
      name: name, priceText: $('newServicePrice').value.trim(), description: $('newServiceDesc').value.trim(),
      orderUrl: $('newServiceOrderUrl').value.trim(), needsTemplate: $('newServiceNeedsTemplate').checked,
      isActive: true, occasions: newOccasions, choices: [], infoFields: [],
      previewMode: $('newServicePreview').value, shapes: shapesFrom('newService'),
      ratioW: parseFloat($('newServiceRatioW').value) || 5, ratioH: parseFloat($('newServiceRatioH').value) || 7,
      textPosition: 'center', aiEnabled: true, uploadEnabled: true, needsInfo: $('newServiceNeedsInfo').checked, productType: $('newServiceProduct').value
    });
    if (r.ok && newImageFile) {
      var fd = new FormData(); fd.append('id', r.id); fd.append('image', newImageFile);
      var up = await hqUpload('service_image', fd);
      if (!up.ok) toast('Service created, but the photo failed: ' + (up.error || ''));
    }
    btn.disabled = false;
    if (!r.ok) return toast(r.error || 'Could not add the service.');
    closeModal('addServiceModal');
    await loadServices();
    openDetail(r.id);
  });

  ['addServiceModal', 'occasionsModal'].forEach(function (id) {
    $(id).addEventListener('click', function (e) { if (e.target === $(id)) { id === 'occasionsModal' ? closeOccasions() : closeModal(id); } });
  });

  loadServices();
});
