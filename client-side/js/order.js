// The order page: options, design (template / AI prompt / upload), shape, info to print, live preview (flat or 3D), and 50% down payment.
hqOnReady(async function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = hqEsc;
  function peso(n) { return '\u20B1' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function loadImg(src) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }

  var id = new URLSearchParams(location.search).get('service') || 0;
  var r = await hqShop('service', undefined, { id: id });
  if (!r.ok) { $('orderLayout').innerHTML = '<p class="order-message">' + esc(r.error || 'Service not found.') + ' <a href="our-services.html"><b>Back to services</b></a></p>'; return; }
  var svc = r.service;
  document.title = 'Order ' + svc.name + ' \u2014 Happy Queen\'s Crafty House';
  $('orderTitle').textContent = 'Order: ' + svc.name;
  $('orderSub').textContent = svc.description || 'Customize it, preview it, and pay a down payment to start.';
  if (!svc.needsInfo) svc.infoFields = [];   // this service doesn't ask the customer for any info
  var unitName = svc.unitLabel || 'pc';
  svc.priceMatrix = svc.priceMatrix || { groups: [], prices: {} };
  if (Array.isArray(svc.priceMatrix.prices)) svc.priceMatrix.prices = {};
  var prices = svc.priceMatrix.prices;
  var mGroups = (svc.priceMatrix.groups || []).filter(function (gid) { return svc.choices.some(function (g) { return g.id === gid; }); });

  var cutShapes = svc.cutShapes || [], hasCut = cutShapes.length > 0;
  var A = svc.ratioW || 5, B = svc.ratioH || 7, square = Math.abs(A - B) < 0.01;
  var st = {
    choices: {}, templateId: null, templateImg: null, uploadPath: null, uploadImg: null, uploading: false,
    prompt: '', spec: null, values: {}, qty: 1, payOption: 'down',
    shape: (svc.shapes && svc.shapes[0]) || 'no-fold', occasion: null,
    orientation: A > B ? 'landscape' : 'portrait',
    cutShape: hasCut ? cutShapes[0] : null, subject: null, serverSubject: false, tol: 40,
    bg: '#cfe0e6', fulfillment: 'pickup'
  };
  var is3d = svc.previewMode === '3d', viewer = null, product = svc.productType || 'paper';
  var cv = { cover: document.createElement('canvas'), insideL: document.createElement('canvas'), insideR: document.createElement('canvas'), back: document.createElement('canvas'), edge: document.createElement('canvas') };

  // ---------------- sizes ----------------
  function dims() {
    if (st.cutShape) return st.cutShape === 'photo' && st.subject ? { w: st.subject.width, h: st.subject.height } : { w: 1, h: 1 };
    var L = Math.max(A, B), S = Math.min(A, B);
    return st.orientation === 'landscape' ? { w: L, h: S } : { w: S, h: L };
  }
  function size(max) { var d = dims(); return { w: Math.round(d.w >= d.h ? max : max * d.w / d.h), h: Math.round(d.h >= d.w ? max : max * d.h / d.w) }; }
  function image() { return st.uploadImg || st.templateImg || null; }
  function spec() { return image() ? null : st.spec; }
  function cutOpt() { return st.cutShape ? { shape: st.cutShape, hole: !!svc.cutHole, subject: st.subject } : null; }

  // ---------------- preview ----------------
  var stage = $('previewStage');
  stage.style.background = st.bg;
  if (is3d) viewer = HQViewer.create(stage, { w: dims().w, h: dims().h, shape: st.cutShape ? 'cutout' : st.shape, product: product });
  if (!viewer) {
    is3d = false; cv.cover.className = 'flat-canvas'; stage.appendChild(cv.cover);
    cv.back.className = 'flat-canvas'; cv.back.style.display = 'none'; stage.appendChild(cv.back);   // the back side, shown with the Front / Back switch
  }

  var EDGE = { paper: '#f1ece0', photo: '#fbfbfa', sticker: '#f4efe6', magnet: '#3a3a40', keychain: '#dfeaee' };

  function renderPreview() {
    var d = dims(), s = size(900);
    var base = { w: s.w, h: s.h, spec: spec(), image: image(), fields: svc.infoFields, values: st.values, textPosition: svc.textPosition, placeholders: true, cut: cutOpt() };
    HQDesign.draw(cv.cover, Object.assign({}, base, { mode: 'cover' }));
    var W = cv.cover.width, H = cv.cover.height;

    // the back of the product (magnet sheet, acrylic backing, sticker liner, photo paper, card back)
    if (st.cutShape) {
      var t = document.createElement('canvas');
      HQDesign.draw(t, { w: W, h: H, mode: 'back', product: product });
      cv.back.width = W; cv.back.height = H;
      var bx = cv.back.getContext('2d'); bx.clearRect(0, 0, W, H); bx.drawImage(t, 0, 0);
      bx.globalCompositeOperation = 'destination-in';          // same outline as the front, mirrored because it's seen from behind
      bx.save(); bx.translate(W, 0); bx.scale(-1, 1); bx.drawImage(cv.cover, 0, 0); bx.restore();
      bx.globalCompositeOperation = 'source-over';
      cv.edge.width = W; cv.edge.height = H;                   // the thickness of the piece
      var ex = cv.edge.getContext('2d'); ex.clearRect(0, 0, W, H); ex.drawImage(cv.cover, 0, 0);
      ex.globalCompositeOperation = 'source-in'; ex.fillStyle = EDGE[product] || EDGE.paper; ex.fillRect(0, 0, W, H); ex.globalCompositeOperation = 'source-over';
    } else {
      HQDesign.draw(cv.back, Object.assign({}, base, { mode: 'back', product: product }));
    }
    if (!viewer) return;

    viewer.setSize(d.w, d.h);
    viewer.setProduct(product, (st.cutShape && svc.cutHole) ? HQDesign.holePos(st.cutShape, W, H) : null);
    if (st.cutShape) { viewer.setShape('cutout'); viewer.setTextures({ cover: cv.cover, back: cv.back, edge: cv.edge }); return; }
    viewer.setHinge(st.orientation === 'landscape' ? 'top' : 'side');   // landscape cards open upward
    viewer.setShape(st.shape);
    var two = st.shape === 'two-fold';
    if (two) {
      HQDesign.draw(cv.insideL, Object.assign({}, base, { mode: 'inside-left' }));
      HQDesign.draw(cv.insideR, Object.assign({}, base, { mode: 'inside-right' }));
    }
    viewer.setTextures({ cover: cv.cover, insideL: two ? cv.insideL : null, insideR: two ? cv.insideR : null, back: cv.back });
  }
  var schedule = debounce(renderPreview, 120);

  // preview background colour (a white product disappears on a white background)
  var SWATCHES = ['#cfe0e6', '#ffffff', '#f3d9dc', '#e9d8a6', '#2b3a42', '#123339'];
  function setBg(c) {
    st.bg = c; stage.style.background = c; $('bgColor').value = c;
    $('bgSwatches').querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-active', b.dataset.c === c); });
  }
  $('bgSwatches').innerHTML = SWATCHES.map(function (c) { return '<button type="button" data-c="' + c + '" style="background:' + c + '" aria-label="Background ' + c + '"></button>'; }).join('');
  $('bgSwatches').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { setBg(b.dataset.c); }); });
  $('bgColor').addEventListener('input', function () { setBg(this.value); });
  setBg(st.bg);

  // Front / Back (works in the flat preview and in 3D)
  var faceSwitch = $('faceSwitch'), face = 'front';
  faceSwitch.innerHTML = [['front', 'Front'], ['back', 'Back']].map(function (f) { return '<button type="button" data-f="' + f[0] + '" class="' + (f[0] === face ? 'is-active' : '') + '">' + f[1] + '</button>'; }).join('');
  faceSwitch.querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () {
      face = b.dataset.f;
      faceSwitch.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-active', x === b); });
      if (viewer) viewer.setFace(face);
      else { cv.cover.style.display = face === 'front' ? '' : 'none'; cv.back.style.display = face === 'back' ? '' : 'none'; }
    });
  });

  // portrait / landscape (every product except squares and cut-out shapes)
  var orient = $('orientSwitch');
  if (square || hasCut) { orient.style.display = 'none'; }
  else {
    orient.innerHTML = [['portrait', 'Portrait'], ['landscape', 'Landscape']].map(function (o) { return '<button type="button" data-o="' + o[0] + '" class="' + (o[0] === st.orientation ? 'is-active' : '') + '">' + o[1] + '</button>'; }).join('');
    orient.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        st.orientation = b.dataset.o;
        if (viewer) { viewer.setOpen(false); $('toggleOpenBtn').textContent = 'Open card'; }
        orient.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-active', x === b); });
        renderPreview();
      });
    });
  }

  // 3D controls
  var shapeSwitch = $('shapeSwitch');
  if (viewer) {
    $('previewHint').textContent = 'Drag to rotate it, or use Front / Back to see the other side.';
    if (!hasCut && svc.shapes.length > 1) {
      var names = { 'no-fold': 'No fold', 'two-fold': 'Two-fold' };
      shapeSwitch.innerHTML = svc.shapes.map(function (s) { return '<button type="button" data-shape="' + s + '" class="' + (s === st.shape ? 'is-active' : '') + '">' + names[s] + '</button>'; }).join('');
      shapeSwitch.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          st.shape = b.dataset.shape; viewer.setShape(st.shape); viewer.setOpen(false); $('toggleOpenBtn').textContent = 'Open card';
          shapeSwitch.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-active', x === b); });
          $('toggleOpenBtn').style.display = st.shape === 'two-fold' ? '' : 'none';
          renderPreview();
        });
      });
    } else { shapeSwitch.style.display = 'none'; }
    $('toggleOpenBtn').style.display = (!hasCut && st.shape === 'two-fold') ? '' : 'none';
    $('toggleOpenBtn').addEventListener('click', function () { var open = !viewer.isOpen(); viewer.setOpen(open); this.textContent = open ? 'Close card' : 'Open card'; });
    $('resetViewBtn').addEventListener('click', function () { viewer.resetView(); });
  } else {
    shapeSwitch.style.display = 'none'; $('toggleOpenBtn').style.display = 'none'; $('resetViewBtn').style.display = 'none';
    $('previewHint').textContent = 'This is a preview. Final colors may look slightly different when printed.';
  }

  // ---------------- 1. options (choices) + price table ----------------
  function isMatrixGroup(g) { return mGroups.indexOf(g.id) !== -1; }
  function isReq(g) { return g.required || isMatrixGroup(g); }
  if (!svc.choices.length) $('blockChoices').style.display = 'none';
  $('choicesBox').innerHTML = svc.choices.map(function (g, gi) {
    var none = isReq(g) ? '' : '<label><input type="radio" name="ch' + gi + '" value="" checked> None</label>';
    return '<div class="choice-group"><strong>' + esc(g.name) + (isReq(g) ? ' <span style="color:#c0392b">*</span>' : '') + '</strong><div class="choice-list">' + none +
      g.options.map(function (o, oi) {
        return '<label><input type="radio" name="ch' + gi + '" value="' + esc(o.name) + '"' + (isReq(g) && oi === 0 ? ' checked' : '') + '> ' + esc(o.name) + (o.price && !isMatrixGroup(g) ? ' <em>+' + peso(o.price) + '</em>' : '') + '</label>';
      }).join('') + '</div></div>';
  }).join('');
  svc.choices.forEach(function (g) { if (isReq(g) && g.options.length) st.choices[g.name] = g.options[0].name; });

  // the price list the customer can see (price for every combination)
  function renderPriceTable() {
    var box = $('priceTable');
    if (!mGroups.length) { box.innerHTML = ''; return; }
    var gs = mGroups.map(function (gid) { return svc.choices.find(function (g) { return g.id === gid; }); });
    var combos = [[]];
    gs.forEach(function (g) { var next = []; combos.forEach(function (c) { g.options.forEach(function (o) { next.push(c.concat([{ g: g, o: o }])); }); }); combos = next; });
    box.innerHTML = '<table class="price-table"><thead><tr><th>' + gs.map(function (g) { return esc(g.name); }).join(' &middot; ') + '</th><th>Price per ' + esc(unitName) + '</th></tr></thead><tbody>' +
      combos.map(function (c) {
        var key = c.map(function (x) { return x.o.id; }).join('|'), p = Number(prices[key]) || 0;
        var sel = c.every(function (x) { return st.choices[x.g.name] === x.o.name; });
        return '<tr class="' + (sel ? 'is-selected' : '') + '"><td>' + c.map(function (x) { return esc(x.o.name); }).join(' &middot; ') + '</td><td>' + (p > 0 ? peso(p) : '<em>not set</em>') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  $('choicesBox').querySelectorAll('input[type=radio]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var gi = parseInt(inp.name.slice(2), 10), g = svc.choices[gi];
      if (inp.value) st.choices[g.name] = inp.value; else delete st.choices[g.name];
      updateSummary(); renderPriceTable();
    });
  });
  renderPriceTable();

  // ---------------- 2. design ----------------
  var hasTemplates = svc.needsTemplate && svc.templates.length > 0;
  if (!hasTemplates) $('templateWrap').style.display = 'none';
  if (!svc.aiEnabled) $('aiWrap').style.display = 'none';
  if (!svc.uploadEnabled && !hasCut) $('uploadWrap').style.display = 'none';
  var showUpload = svc.uploadEnabled || hasCut;
  if (!hasTemplates && !svc.aiEnabled && !showUpload) $('blockDesign').style.display = 'none';
  if ((hasTemplates && svc.aiEnabled) || (hasTemplates && showUpload) || (svc.aiEnabled && showUpload)) $('orDivider1').style.display = '';
  $('blockDesignSub').textContent = hasCut ? 'Upload your photo (best), or pick a template / describe a design.'
    : hasTemplates ? 'Pick a template, or leave it unselected and describe your own design. You can also upload your own.'
    : (svc.aiEnabled ? 'Describe the design you want, or upload your own.' : 'Upload your design or photo.');

  function lockAi() {
    var locked = !!(st.templateId || st.uploadPath || st.uploadImg);
    $('aiWrap').classList.toggle('is-locked', locked);
    $('aiPrompt').disabled = locked; $('aiBtn').disabled = locked;
    if (locked) $('aiStatus').textContent = (st.uploadPath || st.uploadImg) ? 'Remove your uploaded design to use the AI prompt.' : 'Deselect the template to use the AI prompt.';
    else $('aiStatus').textContent = st.prompt ? '' : 'Tip: type something like "gold and white wedding with flowers".';
  }

  var byOcc = {};
  svc.templates.forEach(function (t) { (byOcc[t.occasion] = byOcc[t.occasion] || []).push(t); });
  var occs = Object.keys(byOcc);
  st.occasion = occs[0] || null;

  function renderTemplates() {
    $('occasionTabs').innerHTML = occs.map(function (o) { return '<button type="button" data-occ="' + esc(o) + '" class="' + (o === st.occasion ? 'is-active' : '') + '">' + esc(o) + '</button>'; }).join('');
    $('occasionTabs').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { st.occasion = b.dataset.occ; renderTemplates(); }); });
    $('templateGrid').innerHTML = (byOcc[st.occasion] || []).map(function (t) {
      return '<button type="button" class="template-tile' + (t.id === st.templateId ? ' is-selected' : '') + '" data-id="' + t.id + '" title="' + esc(t.name) + '"><img src="' + esc(hqAsset(t.file)) + '" alt="' + esc(t.name) + '"></button>';
    }).join('') || '<p class="template-empty">No templates here yet.</p>';
    $('templateGrid').querySelectorAll('.template-tile').forEach(function (b) {
      b.addEventListener('click', async function () {
        var tid = parseInt(b.dataset.id, 10);
        if (st.templateId === tid) { st.templateId = null; st.templateImg = null; }       // click again = deselect
        else {
          var t = svc.templates.find(function (x) { return x.id === tid; });
          if (st.uploadImg) removeUpload(true);
          st.templateId = tid; st.templateImg = await loadImg(hqAsset(t.file));
        }
        renderTemplates(); lockAi(); schedule();
      });
    });
  }
  if (hasTemplates) renderTemplates();

  // AI prompt: the built-in designer answers instantly while typing; Enter / button asks the AI for a richer one
  var aiRun = 0;
  $('aiPrompt').addEventListener('input', debounce(function () {
    st.prompt = $('aiPrompt').value.trim();
    st.spec = st.prompt ? HQDesign.localSpec(st.prompt) : null;
    $('aiStatus').textContent = st.prompt ? 'Live preview. Press Enter or "Generate with AI" for a richer design.' : '';
    schedule();
  }, 300));
  async function generateAi() {
    var p = $('aiPrompt').value.trim();
    if (!p || st.templateId || st.uploadImg) return;
    st.prompt = p; var run = ++aiRun;
    $('aiBtn').disabled = true; $('aiStatus').textContent = 'Designing\u2026';
    var res = await hqAi('design', { prompt: p, service: svc.name });
    if (run !== aiRun) return;
    $('aiBtn').disabled = false;
    if (res.ok) { st.spec = res.spec; $('aiStatus').textContent = 'AI design applied. Change the prompt to try again.'; }
    else { st.spec = HQDesign.localSpec(p); $('aiStatus').textContent = res.status === 501 ? 'Made with our built-in designer. Change the prompt to try again.' : (res.error || 'Made with our built-in designer.'); }
    schedule();
  }
  $('aiBtn').addEventListener('click', generateAi);
  $('aiPrompt').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); generateAi(); } });

  // upload your own design / photo
  function removeUpload(silent) {
    st.uploadPath = null; st.uploadImg = null; st.subject = null; st.serverSubject = false;
    $('designFile').value = ''; $('uploadName').textContent = ''; $('removeUpload').style.display = 'none';
    if (!silent) { lockAi(); schedule(); }
  }
  $('uploadBtn').addEventListener('click', function () { $('designFile').click(); });
  $('removeUpload').addEventListener('click', function () { removeUpload(); });
  $('designFile').addEventListener('change', async function (e) {
    var f = e.target.files[0]; if (!f) return;
    if (!/\.(png|jpe?g)$/i.test(f.name)) { alert('Please upload a PNG or JPG image.'); e.target.value = ''; return; }
    st.templateId = null; st.templateImg = null; if (hasTemplates) renderTemplates();
    st.uploadImg = await loadImg(URL.createObjectURL(f));
    st.serverSubject = false; st.subject = null;
    $('uploadName').textContent = 'Uploading ' + f.name + '\u2026'; $('removeUpload').style.display = '';
    st.uploading = true; lockAi();
    if (st.cutShape === 'photo') computeSubject(false); else schedule();
    var fd = new FormData(); fd.append('design', f);
    var up = await hqShopUpload('upload_design', fd);
    st.uploading = false;
    if (!up.ok) { alert(up.error || 'Upload failed.'); removeUpload(); return; }
    st.uploadPath = up.path; $('uploadName').textContent = f.name; lockAi();
    if (st.cutShape === 'photo' && svc.removeBgAvailable) computeSubject(true);   // clean cut-out with rembg
  });
  $('removeUpload').style.display = 'none';
  lockAi();

  // ---------------- shape (keychains, magnets) ----------------
  var SHAPE_NAMES = { circle: 'Circle', triangle: 'Triangle', square: 'Square', heart: 'Heart', photo: 'Follow my photo (background removed)' };
  var cutRun = 0;
  // useServer = true: rembg on our server (clean cut-out, takes a few seconds). false: the quick built-in remover.
  async function computeSubject(useServer) {
    var run = ++cutRun;
    if (!st.uploadImg) { st.subject = null; st.serverSubject = false; schedule(); return; }
    if (useServer) {
      if (!st.uploadPath) { alert('Please wait for your photo to finish uploading.'); return; }
      $('cutStatus').textContent = 'Removing the background\u2026 this can take a few seconds.';
      var rb = await hqShop('remove_bg', { path: st.uploadPath });
      if (run !== cutRun) return;
      if (rb.ok) {
        var im = await loadImg(hqAsset(rb.path));
        if (run !== cutRun) return;
        if (im) { st.subject = HQDesign.removeBackground(im, 0); st.serverSubject = true; $('tolRange').disabled = true; $('cutStatus').textContent = 'Background removed.'; schedule(); return; }
      }
      $('cutStatus').textContent = (rb.error || 'The automatic remover could not be used.') + ' Showing the quick version.';
    } else {
      $('cutStatus').textContent = 'Quick preview. Tip: works best on a plain background.';
    }
    st.serverSubject = false; $('tolRange').disabled = false;
    st.subject = HQDesign.removeBackground(st.uploadImg, st.tol);
    schedule();
  }
  if (hasCut) {
    $('blockCut').style.display = '';
    $('cutOptions').innerHTML = cutShapes.map(function (c) {
      return '<label><input type="radio" name="cutShape" value="' + c + '"' + (c === st.cutShape ? ' checked' : '') + '> ' + SHAPE_NAMES[c] + '</label>';
    }).join('');
    function showCutBox() { $('bgRemoveBox').style.display = st.cutShape === 'photo' ? '' : 'none'; }
    $('cutOptions').querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        st.cutShape = inp.value; showCutBox();
        if (st.cutShape === 'photo' && st.uploadImg && !st.subject) computeSubject(!!(svc.removeBgAvailable && st.uploadPath)); else renderPreview();
      });
    });
    $('tolRange').addEventListener('input', debounce(function () { st.tol = parseInt($('tolRange').value, 10); computeSubject(false); }, 200));
    if (svc.removeBgAvailable) { $('aiRemoveBtn').style.display = ''; $('aiRemoveBtn').addEventListener('click', function () { computeSubject(true); }); }
    showCutBox();
    $('previewHint').textContent = viewer ? 'Drag to rotate. The shape follows what you choose below.' : 'This is a preview of the shape you chose.';
  }

  // ---------------- 3. info to print ----------------
  if (!svc.infoFields.length) $('blockInfo').style.display = 'none';
  $('infoBox').innerHTML = svc.infoFields.map(function (f) {
    var lab = '<label for="f_' + f.key + '">' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>';
    var inp = f.type === 'textarea' ? '<textarea id="f_' + f.key + '" data-k="' + f.key + '" maxlength="500"></textarea>'
      : '<input type="' + (f.type === 'date' || f.type === 'time' ? f.type : 'text') + '" id="f_' + f.key + '" data-k="' + f.key + '" maxlength="200">';
    return '<div class="field">' + lab + inp + '</div>';
  }).join('');
  $('infoBox').querySelectorAll('[data-k]').forEach(function (el) {
    el.addEventListener('input', function () { st.values[el.dataset.k] = el.value; schedule(); });
  });

  // ---------------- 4. quantity, payment, summary ----------------
  function calc() {
    var base = 0, extra = 0, missing = false;
    svc.choices.forEach(function (g) {
      if (isMatrixGroup(g)) return;                       // those groups are priced by the price table
      var pick = st.choices[g.name]; g.options.forEach(function (o) { if (o.name === pick) extra += Number(o.price) || 0; });
    });
    if (mGroups.length) {
      var key = mGroups.map(function (gid) {
        var g = svc.choices.find(function (x) { return x.id === gid; }), o = g && g.options.find(function (x) { return x.name === st.choices[g.name]; });
        return o ? o.id : '';
      }).join('|');
      base = Number(prices[key]) || 0; if (base <= 0) missing = true;
    } else base = parseFloat(((String(svc.priceText).match(/\d+(\.\d+)?/)) || ['0'])[0]) || 0;
    var unit = base + extra, totalC = Math.round(unit * st.qty * 100);
    var dueC = st.payOption === 'full' ? totalC : Math.ceil(totalC * svc.downpaymentPercent / 100);
    return { unit: unit, total: totalC / 100, due: dueC / 100, balance: (totalC - dueC) / 100, missing: missing };
  }
  function updateSummary() {
    var c = calc();
    if (c.total <= 0) {
      $('summary').innerHTML = '<div class="summary-row">' + (c.missing ? 'The price for this choice is not set yet. Please pick another option, or contact us.' : 'This service has no price yet. Please contact us to order.') + '</div>'; $('payBtn').disabled = true; $('payBtn').textContent = 'Not available'; return;
    }
    $('summary').innerHTML =
      '<div class="summary-row"><span>Price per ' + esc(unitName) + '</span><span>' + peso(c.unit) + '</span></div>' +
      '<div class="summary-row"><span>Quantity</span><span>' + st.qty + '</span></div>' +
      '<div class="summary-row is-total"><span>Total</span><span>' + peso(c.total) + '</span></div>' +
      '<div class="summary-row is-due"><span>' + (st.payOption === 'full' ? 'Pay now' : 'Pay now (' + svc.downpaymentPercent + '% down payment)') + '</span><span>' + peso(c.due) + '</span></div>' +
      (c.balance > 0 ? '<div class="summary-row"><span>Balance (pay on pickup / delivery)</span><span>' + peso(c.balance) + '</span></div>' : '') +
      (st.fulfillment === 'delivery' ? '<div class="summary-row"><span>Lalamove delivery fee</span><span>Added when packing</span></div>' : '');
    $('payBtn').disabled = false;
    $('payBtn').textContent = 'Pay ' + peso(c.due) + ' with GCash / PayMaya';
  }
  $('optDownLabel').textContent = svc.downpaymentPercent + '% down payment';
  if (unitName !== 'pc') $('qtyLabel').textContent = 'Quantity (number of ' + unitName + 's)';
  $('qty').addEventListener('input', function () { st.qty = Math.max(1, Math.min(100000, parseInt(this.value, 10) || 1)); updateSummary(); });
  document.querySelectorAll('input[name=payOption]').forEach(function (inp) { inp.addEventListener('change', function () { st.payOption = inp.value; updateSummary(); }); });

  // pickup or delivery (Lalamove). The delivery fee is asked later, when the order is packing.
  function syncFulfillment() { $('deliveryFields').style.display = st.fulfillment === 'delivery' ? '' : 'none'; updateSummary(); }
  document.querySelectorAll('input[name=fulfillment]').forEach(function (inp) { inp.addEventListener('change', function () { st.fulfillment = inp.value; syncFulfillment(); }); });
  hqApi('profile').then(function (pr) {   // use what the customer saved in My Profile
    if (!pr.ok) return;
    $('contactPhone').value = pr.profile.contactNo; $('delName').value = pr.profile.firstName + ' ' + pr.profile.lastName;
    $('delAddress').value = pr.profile.address || ''; $('delLandmark').value = pr.profile.landmark || '';
  });

  function snapshot() {
    var s = size(1200), c = document.createElement('canvas');
    HQDesign.draw(c, { w: s.w, h: s.h, spec: spec(), image: image(), fields: svc.infoFields, values: st.values, textPosition: svc.textPosition, placeholders: false, mode: 'cover', cut: cutOpt() });
    try { return c.toDataURL('image/png'); } catch (e) { return ''; }
  }

  $('orderForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    for (var i = 0; i < svc.infoFields.length; i++) {
      var f = svc.infoFields[i];
      if (f.required && !String(st.values[f.key] || '').trim()) { alert('Please fill in: ' + f.label); $('f_' + f.key).focus(); return; }
    }
    for (var g = 0; g < svc.choices.length; g++) if (isReq(svc.choices[g]) && !st.choices[svc.choices[g].name]) { alert('Please choose: ' + svc.choices[g].name); return; }
    if (!/^(09|\+639)\d{9}$/.test($('contactPhone').value.replace(/[\s-]/g, ''))) { alert('Please enter your mobile number (09XX XXX XXXX).'); $('contactPhone').focus(); return; }
    if (st.fulfillment === 'delivery') {
      if (!$('delName').value.trim()) { alert("Please enter the receiver's name."); $('delName').focus(); return; }
      if ($('delAddress').value.trim().length < 10) { alert('Please enter your complete home address.'); $('delAddress').focus(); return; }
      if ($('delLandmark').value.trim().length < 3) { alert('Please enter a landmark near your address.'); $('delLandmark').focus(); return; }
    }
    if (st.uploading) { alert('Your design is still uploading. Please wait a moment.'); return; }
    var design = st.uploadPath ? { source: 'upload', path: st.uploadPath } : st.templateId ? { source: 'template', templateId: st.templateId } : (st.spec && st.prompt) ? { source: 'ai', prompt: st.prompt, spec: st.spec } : { source: 'none' };
    if (hasCut && st.cutShape === 'photo' && !st.subject) { alert('Please upload your photo first (Design > Upload your own design).'); return; }
    if (hasCut && design.source === 'none') { alert('Please upload your photo, or choose a design.'); return; }
    if (svc.needsTemplate && design.source === 'none') { alert('Please choose a template, describe a design, or upload your own.'); return; }

    var btn = $('payBtn'); btn.disabled = true; btn.textContent = 'Taking you to PayMongo\u2026';
    var res = await hqShop('create_order', {
      serviceId: svc.id, qty: st.qty, payOption: st.payOption, shape: st.shape,
      contactPhone: $('contactPhone').value, fulfillment: st.fulfillment,
      delivery: st.fulfillment === 'delivery' ? { name: $('delName').value, address: $('delAddress').value, landmark: $('delLandmark').value } : null, orientation: st.orientation, cutShape: st.cutShape,
      info: st.values, design: design,
      selections: Object.keys(st.choices).map(function (k) { return { group: k, option: st.choices[k] }; }),
      notes: $('notes').value, previewPng: snapshot()
    });
    if (!res.ok) { alert(res.error || 'Could not place the order.'); updateSummary(); return; }
    window.location.href = res.checkoutUrl;
  });

  updateSummary();
  HQDesign.loadFonts().then(renderPreview);
  renderPreview();
});
