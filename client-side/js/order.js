// The order page: options, size + colour (shown in the preview), design / photos / document upload,
// AI (design or picture editing), shape, info to print, live preview (flat or 3D), delivery and 50% down payment.
hqOnReady(async function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = hqEsc;
  function peso(n) { return '\u20B1' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(x) { return Number(Number(x).toFixed(1)); }
  function loadImg(src) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

  var id = new URLSearchParams(location.search).get('service') || 0;
  var r = await hqShop('service', undefined, { id: id });
  if (!r.ok) { $('orderLayout').innerHTML = '<p class="order-message">' + esc(r.error || 'Service not found.') + ' <a href="our-services.html"><b>Back to services</b></a></p>'; return; }
  var svc = r.service;
  document.title = 'Order ' + svc.name + ' \u2014 Happy Queen\'s Crafty House';
  $('orderTitle').textContent = 'Order: ' + svc.name;
  $('orderSub').textContent = svc.description || 'Customize it, preview it, and pay a down payment to start.';
  if (!svc.needsInfo) svc.infoFields = [];

  var unitName = svc.unitLabel || 'pc';
  svc.priceMatrix = svc.priceMatrix || { groups: [], prices: {} };
  if (Array.isArray(svc.priceMatrix.prices)) svc.priceMatrix.prices = {};
  var prices = svc.priceMatrix.prices;
  var mGroups = (svc.priceMatrix.groups || []).filter(function (gid) { return svc.choices.some(function (g) { return g.id === gid; }); });

  // what the customer uploads here, and how the AI helps
  var kind = svc.uploadKind || 'design', isDoc = kind === 'document', isPhotos = kind === 'photos';
  var aiEdit = !!svc.aiEnabled && svc.aiMode === 'edit', aiGen = !!svc.aiEnabled && !aiEdit;
  var isStrip = svc.frameStyle === 'strip', MAX_PHOTOS = isStrip ? 4 : 30;
  var cutShapes = svc.cutShapes || [], hasCut = cutShapes.length > 0;
  var product = svc.productType || 'paper';
  var A = svc.ratioW || 5, B = svc.ratioH || 7;

  // a group that sets the real size (paper / photo size) and one that sets the print colour
  var sizeGroup = svc.choices.filter(function (g) { return g.role === 'size' && g.options.some(function (o) { return o.w > 0 && o.h > 0; }); })[0] || null;
  var colorGroup = svc.choices.filter(function (g) { return g.role === 'color'; })[0] || null;
  var sizeUnit = sizeGroup ? (sizeGroup.unit || 'mm') : '';
  var refMax = sizeGroup ? Math.max.apply(null, sizeGroup.options.map(function (o) { return Math.max(o.w || 0, o.h || 0); })) : 0;

  function isMatrixGroup(g) { return mGroups.indexOf(g.id) !== -1; }
  function isReq(g) { return g.required || isMatrixGroup(g) || g.role === 'size' || g.role === 'color'; }

  var st = {
    choices: {}, templateId: null, templateImg: null, photos: [], active: 0, uploading: 0,
    prompt: '', spec: null, values: {}, qty: 1, payOption: 'down',
    shape: (svc.shapes && svc.shapes[0]) || 'no-fold', occasion: null, orientation: 'portrait',
    cutShape: hasCut ? cutShapes[0] : null, subject: null, serverSubject: false, tol: 40,
    bg: isStrip ? '#2b3a42' : '#cfe0e6', fulfillment: 'pickup',
    doc: null, docPage: 1, docCanvas: null,
    styles: {}, backStyle: 'color', extra: { back: null, inside: null }      // the customer's font + size per text, and own designs for the back / inside
  };
  svc.choices.forEach(function (g) { if (isReq(g) && g.options.length) st.choices[g.name] = g.options[0].name; });

  function sizeOpt() {
    if (!sizeGroup) return null;
    var o = sizeGroup.options.filter(function (x) { return x.name === st.choices[sizeGroup.name]; })[0];
    return (o && o.w > 0 && o.h > 0) ? o : null;
  }
  function baseDims() { var o = sizeOpt(); return o ? { w: o.w, h: o.h } : { w: A, h: B }; }
  function natural() { var b = baseDims(); return b.w > b.h ? 'landscape' : 'portrait'; }
  st.orientation = natural();
  function isMono() {
    if (!colorGroup) return false;
    var o = colorGroup.options.filter(function (x) { return x.name === st.choices[colorGroup.name]; })[0];
    return !!(o && o.mono);
  }

  // ---------------- the picture(s) the customer uploaded ----------------
  function active() { return st.photos[st.active] || null; }
  function image() { if (isDoc) return null; var e = active(); return e ? e.img : (st.templateImg || null); }
  function spec() { return image() ? null : st.spec; }
  function cutOpt() { return st.cutShape ? { shape: st.cutShape, hole: !!svc.cutHole, subject: st.subject } : null; }

  // a folded card has an outside (front/back) and an inside. Every text says where it is printed.
  function folded() { return st.shape === 'two-fold' && !hasCut && product === 'paper'; }
  function fieldsFor(side) {
    return svc.infoFields.filter(function (f) {
      var p = f.place || 'front';
      if (side === 'front') return p === 'front' || (p === 'inside' && !folded());   // no fold: the inside text goes on the front
      if (side === 'inside') return p === 'inside' && folded();
      return p === 'back';
    });
  }
  function sideImg(which) { var e = st.extra[which]; return e ? e.img : null; }

  // ---------------- sizes ----------------
  function dims() {
    if (st.cutShape) return st.cutShape === 'photo' && st.subject ? { w: st.subject.width, h: st.subject.height } : { w: 1, h: 1 };
    var b = baseDims(), L = Math.max(b.w, b.h), S = Math.min(b.w, b.h);
    return st.orientation === 'landscape' ? { w: L, h: S } : { w: S, h: L };
  }
  function size(max) { var d = dims(); return { w: Math.round(d.w >= d.h ? max : max * d.w / d.h), h: Math.round(d.h >= d.w ? max : max * d.h / d.w) }; }
  function isSquare() { var b = baseDims(); return Math.abs(b.w - b.h) < 0.01 * Math.max(b.w, b.h); }

  // ---------------- preview ----------------
  var cv = { cover: document.createElement('canvas'), insideL: document.createElement('canvas'), insideR: document.createElement('canvas'), back: document.createElement('canvas'), edge: document.createElement('canvas'), inside: document.createElement('canvas') };
  var cropOpen = false;     // the move / zoom editor
  var stage = $('previewStage');
  stage.style.background = st.bg;
  var viewer = null;
  if (svc.previewMode === '3d' && !isDoc) viewer = HQViewer.create(stage, { w: dims().w, h: dims().h, ref: refMax || 0, shape: st.cutShape ? 'cutout' : st.shape, product: product });
  if (!viewer) {
    cv.cover.className = 'flat-canvas'; stage.appendChild(cv.cover);
    cv.back.className = 'flat-canvas'; cv.back.style.display = 'none'; stage.appendChild(cv.back);
    cv.inside.className = 'flat-canvas'; cv.inside.style.display = 'none'; stage.appendChild(cv.inside);
  }

  // flat preview: a smaller size really is drawn smaller (so A4 looks bigger than Short, 8R bigger than 2R...)
  function layoutFlat() {
    if (viewer) return;
    var d = dims(), box = Math.min(stage.clientWidth || 400, stage.clientHeight || 400) * 0.9;
    var k = (refMax && sizeOpt() && !st.cutShape) ? Math.max(d.w, d.h) / (refMax) : 1;
    var target = Math.max(60, box * Math.min(1, k)), w, h;
    if (d.w >= d.h) { w = target; h = target * d.h / d.w; } else { h = target; w = target * d.w / d.h; }
    [cv.cover, cv.back].forEach(function (c) { c.style.width = w + 'px'; c.style.height = h + 'px'; });
    var vert = st.orientation === 'landscape', f = Math.min(1, vert ? (stage.clientHeight || 400) * 0.92 / (2 * h) : (stage.clientWidth || 400) * 0.95 / (2 * w));   // the inside shows both pages
    cv.inside.style.width = (vert ? w : 2 * w) * f + 'px'; cv.inside.style.height = (vert ? 2 * h : h) * f + 'px';
  }
  window.addEventListener('resize', debounce(layoutFlat, 150));

  function updateSizeLabel() {
    var el = $('sizeLabel'), o = sizeOpt();
    if (!o || st.cutShape) { el.textContent = ''; return; }
    var big = Math.max(o.w, o.h), small = Math.min(o.w, o.h), land = st.orientation === 'landscape';
    el.innerHTML = '<b>' + esc(sizeGroup.name) + ':</b> ' + esc(o.name) + ' \u2014 ' + num(land ? big : small) + ' \u00D7 ' + num(land ? small : big) + ' ' + esc(sizeUnit) + (isMono() ? ' \u00B7 black &amp; white' : colorGroup ? ' \u00B7 colored' : '');
  }

  var EDGE = { paper: '#f1ece0', photo: '#fbfbfa', sticker: '#f4efe6', magnet: '#3a3a40', keychain: '#dfeaee' };

  function baseOpts(s) {
    return { w: s.w, h: s.h, spec: spec(), image: image(), images: isPhotos ? st.photos.map(function (p) { return p.img; }) : null,
             tfs: isPhotos ? st.photos.map(function (p) { return p.tf || null; }) : null, tf: (active() && active().tf) || null, frame: svc.frameStyle || '',
             doc: isDoc ? { page: st.docCanvas, name: st.doc && st.doc.name, ext: st.doc && st.doc.ext } : null, mono: isMono(),
             fields: fieldsFor('front'), values: st.values, styles: st.styles, backStyle: st.backStyle, textPosition: svc.textPosition, placeholders: true, cut: cutOpt() };
  }

  function renderPreview() {
    updateSideStyle();
    if (cropOpen && !canCrop()) closeCrop(true);
    updateCropBtn(); if (cropOpen) drawCrop();
    var d = dims(), s = size(900), base = baseOpts(s);
    HQDesign.draw(cv.cover, Object.assign({}, base, { mode: 'cover' }));
    var W = cv.cover.width, H = cv.cover.height;
    updateSizeLabel();

    // the back of the product (magnet sheet, acrylic, sticker liner, photo paper, card back) - or the same picture on both sides
    if (st.cutShape) {
      cv.back.width = W; cv.back.height = H;
      var bx = cv.back.getContext('2d'); bx.clearRect(0, 0, W, H);
      if (svc.doubleSided) {           // back to back: the same picture on the other side (mirrored, like looking through it)
        bx.save(); bx.translate(W, 0); bx.scale(-1, 1); bx.drawImage(cv.cover, 0, 0); bx.restore();
      } else {
        var t = document.createElement('canvas');
        HQDesign.draw(t, { w: W, h: H, mode: 'back', product: product });
        bx.drawImage(t, 0, 0); bx.globalCompositeOperation = 'destination-in';
        bx.save(); bx.translate(W, 0); bx.scale(-1, 1); bx.drawImage(cv.cover, 0, 0); bx.restore();
        bx.globalCompositeOperation = 'source-over';
      }
      cv.edge.width = W; cv.edge.height = H;
      var ex = cv.edge.getContext('2d'); ex.clearRect(0, 0, W, H); ex.drawImage(cv.cover, 0, 0);
      ex.globalCompositeOperation = 'source-in'; ex.fillStyle = EDGE[product] || EDGE.paper; ex.fillRect(0, 0, W, H); ex.globalCompositeOperation = 'source-over';
    } else if (!isDoc) {
      HQDesign.draw(cv.back, Object.assign({}, base, { mode: 'back', product: product, fields: fieldsFor('back'), sideImage: sideImg('back') }));
    }
    // the inside of a folded card: its own text and design, in the same colours as the front
    var two = folded();
    if (two) {
      var ib = Object.assign({}, base, { fields: fieldsFor('inside'), sideImage: sideImg('inside'), split: st.orientation === 'landscape' ? 'v' : 'h' });
      HQDesign.draw(cv.insideL, Object.assign({}, ib, { mode: 'inside-left' }));
      HQDesign.draw(cv.insideR, Object.assign({}, ib, { mode: 'inside-right' }));
      var vert = st.orientation === 'landscape', ic = cv.inside;
      ic.width = vert ? cv.insideL.width : cv.insideL.width * 2; ic.height = vert ? cv.insideL.height * 2 : cv.insideL.height;
      var ix = ic.getContext('2d'); ix.drawImage(cv.insideL, 0, 0); ix.drawImage(cv.insideR, vert ? 0 : cv.insideL.width, vert ? cv.insideL.height : 0);
    }
    if (!viewer) { layoutFlat(); return; }

    viewer.setSize(d.w, d.h, sizeOpt() && !st.cutShape ? refMax : 0);
    viewer.setProduct(product, (st.cutShape && svc.cutHole) ? HQDesign.holePos(st.cutShape, W, H) : null);
    if (st.cutShape) { viewer.setShape('cutout'); viewer.setTextures({ cover: cv.cover, back: cv.back, edge: cv.edge }); return; }
    viewer.setHinge(st.orientation === 'landscape' ? 'top' : 'side');   // landscape cards open upward
    viewer.setShape(st.shape);
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

  // Front / Back (and Inside for a folded card). Works in the flat preview and in 3D.
  var faceSwitch = $('faceSwitch'), face = 'front';
  if (isDoc) faceSwitch.style.display = 'none';
  function showFace(f) {
    face = f;
    faceSwitch.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-active', x.dataset.f === face); });
    if (viewer) {
      viewer.setFace(face === 'back' ? 'back' : 'front');
      viewer.setOpen(face === 'inside'); $('toggleOpenBtn').textContent = face === 'inside' ? 'Close card' : 'Open card';
    } else {
      cv.cover.style.display = face === 'front' ? '' : 'none'; cv.back.style.display = face === 'back' ? '' : 'none'; cv.inside.style.display = face === 'inside' ? '' : 'none';
    }
  }
  function buildFaceSwitch() {
    var faces = [['front', 'Front'], ['back', 'Back']];
    if (folded()) faces.splice(1, 0, ['inside', 'Inside']);
    if (!faces.some(function (f) { return f[0] === face; })) face = 'front';
    faceSwitch.innerHTML = faces.map(function (f) { return '<button type="button" data-f="' + f[0] + '" class="' + (f[0] === face ? 'is-active' : '') + '">' + f[1] + '</button>'; }).join('');
    faceSwitch.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { showFace(b.dataset.f); }); });
  }
  buildFaceSwitch();

  // full screen preview (the browser's full screen, or a full-window view where that isn't available)
  var fsCard = document.querySelector('.order-preview-card');
  function setFullscreen(on) {
    fsCard.classList.toggle('is-fullscreen', on); document.body.classList.toggle('has-fullscreen', on);
    $('fullscreenBtn').innerHTML = on ? '<i class="fa-solid fa-compress"></i> Exit full screen' : '<i class="fa-solid fa-expand"></i> Full screen';
    if (on && fsCard.requestFullscreen) fsCard.requestFullscreen().catch(function () {});
    if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    setTimeout(renderPreview, 200);
  }
  $('fullscreenBtn').addEventListener('click', function () { setFullscreen(!fsCard.classList.contains('is-fullscreen')); });
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && fsCard.classList.contains('is-fullscreen')) setFullscreen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && fsCard.classList.contains('is-fullscreen')) setFullscreen(false); });

  // portrait / landscape
  var orient = $('orientSwitch');
  orient.innerHTML = [['portrait', 'Portrait'], ['landscape', 'Landscape']].map(function (o) { return '<button type="button" data-o="' + o[0] + '">' + o[1] + '</button>'; }).join('');
  function syncOrient() {
    orient.style.display = (hasCut || isSquare()) ? 'none' : '';
    orient.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-active', x.dataset.o === st.orientation); });
  }
  orient.querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () {
      st.orientation = b.dataset.o;
      if (viewer) { viewer.setOpen(false); $('toggleOpenBtn').textContent = 'Open card'; }
      if (face === 'inside') showFace('front');
      syncOrient(); renderPreview(); updateSideStyle();
    });
  });
  syncOrient();

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
          buildFaceSwitch(); showFace('front'); updateSideStyle();
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
    $('previewHint').textContent = isDoc ? 'This is how your file will look on the paper you chose.' : 'This is a preview. Final colors may look slightly different when printed.';
  }

  // ---------------- 1. options (choices) + price table ----------------
  if (!svc.choices.length) $('blockChoices').style.display = 'none';
  $('choicesBox').innerHTML = svc.choices.map(function (g, gi) {
    var none = isReq(g) ? '' : '<label><input type="radio" name="ch' + gi + '" value="" checked> None</label>';
    return '<div class="choice-group"><strong>' + esc(g.name) + (isReq(g) ? ' <span style="color:#c0392b">*</span>' : '') + '</strong><div class="choice-list">' + none +
      g.options.map(function (o, oi) {
        var extra = (g.role === 'size' && o.w > 0 && o.h > 0) ? ' <em>' + num(o.w) + ' \u00D7 ' + num(o.h) + ' ' + esc(g.unit || 'mm') + '</em>' : (o.price && !isMatrixGroup(g) ? ' <em>+' + peso(o.price) + '</em>' : '');
        return '<label><input type="radio" name="ch' + gi + '" value="' + esc(o.name) + '"' + (isReq(g) && oi === 0 ? ' checked' : '') + '> ' + esc(o.name) + extra + (o.note ? '<small class="opt-note">' + esc(o.note) + '</small>' : '') + '</label>';
      }).join('') + '</div></div>';
  }).join('');

  function renderPriceTable() {
    var box = $('priceTable');
    if (!mGroups.length) { box.innerHTML = ''; return; }
    var gs = mGroups.map(function (gid) { return svc.choices.filter(function (g) { return g.id === gid; })[0]; });
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
      if (g === sizeGroup) { st.orientation = natural(); syncOrient(); }
      updateSummary(); renderPriceTable();
      if (g === sizeGroup || g === colorGroup) renderPreview();
    });
  });
  renderPriceTable();

  // ---------------- 2. design / photos / document ----------------
  var hasTemplates = svc.needsTemplate && svc.templates.length > 0 && !isDoc && !isPhotos;
  var showDesign = !isDoc && (hasTemplates || svc.aiEnabled || (!isPhotos && (svc.uploadEnabled || hasCut)));
  if (!showDesign) $('blockDesign').style.display = 'none';
  if (!hasTemplates) $('templateWrap').style.display = 'none';
  if (!svc.aiEnabled) $('aiWrap').style.display = 'none';
  var showUploadBtn = !isDoc && !isPhotos && (svc.uploadEnabled || hasCut || aiEdit);
  if (!showUploadBtn) $('uploadWrap').style.display = 'none';
  $('orDivider1').style.display = (!aiEdit && ((hasTemplates && svc.aiEnabled) || (hasTemplates && showUploadBtn) || (aiGen && showUploadBtn))) ? '' : 'none';
  $('blockDesignSub').textContent = aiEdit ? (isPhotos ? 'Pick one of your photos, then tell the AI what to change.' : 'Upload your picture, then tell the AI how to change it. You can type in Tagalog or English.')
    : hasCut ? 'Upload your photo (best), or pick a template / describe a design.'
    : hasTemplates ? 'Pick a template, or leave it unselected and describe your own design. You can also upload your own.'
    : (aiGen ? 'Describe the design you want, or upload your own.' : 'Upload your design or photo.');

  // AI box: design mode (makes a design) or edit mode (changes the customer's own picture)
  if (aiEdit) {
    $('aiPrompt').placeholder = isPhotos ? 'e.g. gawing naka-formal na barong, puting background' : 'e.g. gawing cartoon style / make it a pastel watercolor';
    $('aiBtn').innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Edit with AI';
  }

  function lockAi() {
    if (aiEdit) {
      var has = !!active();
      $('aiWrap').classList.toggle('is-locked', !has); $('aiPrompt').disabled = !has; $('aiBtn').disabled = !has;
      if (!has) $('aiStatus').textContent = 'Upload a photo first, then tell the AI how to change it.';
      else if (!$('aiStatus').textContent || /Upload a photo first/.test($('aiStatus').textContent)) $('aiStatus').textContent = 'Describe the change you want (Tagalog or English). Example: "gawing naka-formal na barong".';
      var e = active(); $('aiUndoBtn').style.display = e && e.orig ? '' : 'none';
      return;
    }
    var locked = !!(st.templateId || active());
    $('aiWrap').classList.toggle('is-locked', locked);
    $('aiPrompt').disabled = locked; $('aiBtn').disabled = locked;
    if (locked) $('aiStatus').textContent = active() ? 'Remove your uploaded design to use the AI prompt.' : 'Deselect the template to use the AI prompt.';
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
        if (st.templateId === tid) { st.templateId = null; st.templateImg = null; }
        else {
          var t = svc.templates.filter(function (x) { return x.id === tid; })[0];
          st.photos = []; st.active = 0; renderThumbs();
          st.templateId = tid; st.templateImg = await loadImg(hqAsset(t.file));
        }
        renderTemplates(); lockAi(); schedule();
      });
    });
  }
  if (hasTemplates) renderTemplates();

  // ---- AI: design mode (live while typing, Enter for a richer one) ----
  var aiRun = 0;
  if (aiGen) {
    $('aiPrompt').addEventListener('input', debounce(function () {
      st.prompt = $('aiPrompt').value.trim();
      st.spec = st.prompt ? HQDesign.localSpec(st.prompt) : null;
      $('aiStatus').textContent = st.prompt ? 'Live preview. Press Enter or "Generate with AI" for a richer design.' : '';
      schedule();
    }, 300));
  }
  async function generateAi() {
    var p = $('aiPrompt').value.trim();
    if (!p || st.templateId || active()) return;
    st.prompt = p; var run = ++aiRun;
    $('aiBtn').disabled = true; $('aiStatus').textContent = 'Designing\u2026';
    var res = await hqAi('design', { prompt: p, service: svc.name });
    if (run !== aiRun) return;
    $('aiBtn').disabled = false;
    if (res.ok) { st.spec = res.spec; $('aiStatus').textContent = 'AI design applied. Change the prompt to try again.'; }
    else { st.spec = HQDesign.localSpec(p); $('aiStatus').textContent = res.status === 501 ? 'Made with our built-in designer. Change the prompt to try again.' : (res.error || 'Made with our built-in designer.'); }
    schedule();
  }
  // ---- AI: edit mode (changes the customer's own picture) ----
  async function aiEditRun() {
    var e = active(), p = $('aiPrompt').value.trim();
    if (!e) { alert('Upload a photo first.'); return; }
    if (!e.path) { alert('Please wait for your picture to finish uploading.'); return; }
    if (!p) return;
    var run = ++aiRun;
    $('aiBtn').disabled = true; $('aiStatus').textContent = 'Editing your picture with AI\u2026 this can take up to a minute.';
    var res = await hqAi('edit', { path: e.path, prompt: p, service: svc.name });
    if (run !== aiRun) return;
    $('aiBtn').disabled = false;
    if (!res.ok) { $('aiStatus').textContent = res.status === 501 ? 'AI picture editing is not set up yet.' : (res.error || 'The AI could not edit this picture.'); return; }
    var im = await loadImg(hqAsset(res.path));
    if (!im) { $('aiStatus').textContent = 'The edited picture could not be opened.'; return; }
    if (!e.orig) { e.orig = e.path; e.origImg = e.img; }
    e.path = res.path; e.img = im; e.aiPrompt = p; st.subject = null; st.serverSubject = false;
    $('aiStatus').textContent = 'Done! Change the prompt to try again, or undo to go back to your original picture.';
    lockAi(); renderThumbs();
    if (st.cutShape === 'photo') computeSubject(!!svc.removeBgAvailable); else schedule();
  }
  $('aiUndoBtn').addEventListener('click', function () {
    var e = active(); if (!e || !e.orig) return;
    e.path = e.orig; e.img = e.origImg; e.orig = null; e.origImg = null; e.aiPrompt = ''; st.subject = null; st.serverSubject = false;
    $('aiStatus').textContent = 'Back to your original picture.'; lockAi(); renderThumbs();
    if (st.cutShape === 'photo') computeSubject(!!svc.removeBgAvailable); else schedule();
  });
  $('aiBtn').addEventListener('click', function () { aiEdit ? aiEditRun() : generateAi(); });
  $('aiPrompt').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aiEdit ? aiEditRun() : generateAi(); } });

  // ---- uploading pictures (one design picture, or several photos) ----
  async function addPhoto(f, replace) {
    if (!/\.(png|jpe?g)$/i.test(f.name)) { alert(f.name + ': please upload a PNG or JPG image.'); return null; }
    if (f.size > 10 * 1048576) { alert(f.name + ' is larger than 10 MB.'); return null; }
    var img = await loadImg(URL.createObjectURL(f));
    if (!img) { alert(f.name + ' could not be opened as a picture.'); return null; }
    var entry = { name: f.name, img: img, path: null, orig: null, origImg: null, aiPrompt: '' };
    if (replace) { st.photos = [entry]; st.active = 0; } else { st.photos.push(entry); st.active = st.photos.length - 1; }
    st.subject = null; st.serverSubject = false;
    renderThumbs(); lockAi();
    if (st.cutShape === 'photo') computeSubject(false); else schedule();
    st.uploading++;
    var fd = new FormData(); fd.append('design', f);
    var up = await hqShopUpload('upload_design', fd);
    st.uploading--;
    if (st.photos.indexOf(entry) === -1) return null;                      // removed while uploading
    if (!up.ok) { alert(up.error || 'Upload failed.'); removePhoto(st.photos.indexOf(entry)); return null; }
    entry.path = up.path; renderThumbs(); lockAi();
    if (st.cutShape === 'photo' && svc.removeBgAvailable && active() === entry) computeSubject(true);
    return entry;
  }
  function removePhoto(i) {
    if (i < 0) return;
    st.photos.splice(i, 1); st.active = Math.max(0, Math.min(st.active, st.photos.length - 1));
    st.subject = null; st.serverSubject = false; renderThumbs(); lockAi();
    if (st.cutShape === 'photo' && active()) computeSubject(false); else schedule();
    updateSummary();
  }
  function renderThumbs() {
    var n = st.photos.length;
    if (isPhotos) {
      $('photosCount').textContent = n ? n + ' photo' + (n > 1 ? 's' : '') + (isStrip ? ' (a strip uses up to 4)' : '') : '';
      $('photoThumbs').innerHTML = st.photos.map(function (p, i) {
        return '<div class="photo-thumb' + (i === st.active ? ' is-active' : '') + '" data-i="' + i + '" title="' + esc(p.name) + (p.orig ? ' (AI edited)' : '') + '"><img src="' + esc(p.img.src) + '" alt=""><button type="button" class="photo-x" data-x="' + i + '" aria-label="Remove">&times;</button></div>';
      }).join('');
      $('photoThumbs').querySelectorAll('.photo-thumb').forEach(function (t) { t.addEventListener('click', function (e) { if (e.target.dataset.x !== undefined) return; st.active = parseInt(t.dataset.i, 10); st.subject = null; renderThumbs(); lockAi(); schedule(); if (cropOpen) { syncZoom(); drawCrop(); } }); });
      $('photoThumbs').querySelectorAll('.photo-x').forEach(function (b) { b.addEventListener('click', function () { removePhoto(parseInt(b.dataset.x, 10)); }); });
    } else {
      var e = st.photos[0];
      $('uploadName').textContent = e ? (e.path ? e.name : 'Uploading ' + e.name + '\u2026') : '';
      $('removeUpload').style.display = e ? '' : 'none';
    }
    updateSummary();
  }
  $('uploadBtn').addEventListener('click', function () { $('designFile').click(); });
  $('removeUpload').addEventListener('click', function () { removePhoto(0); });
  $('designFile').addEventListener('change', async function (e) {
    var f = e.target.files[0]; e.target.value = ''; if (!f) return;
    st.templateId = null; st.templateImg = null; if (hasTemplates) renderTemplates();
    await addPhoto(f, true);
  });
  $('photosBtn').addEventListener('click', function () { $('photosFile').click(); });
  $('photosFile').addEventListener('change', async function (e) {
    var files = Array.prototype.slice.call(e.target.files); e.target.value = '';
    for (var i = 0; i < files.length; i++) {
      if (st.photos.length >= MAX_PHOTOS) { alert('You can add up to ' + MAX_PHOTOS + ' photos' + (isStrip ? ' on a photo strip' : '') + '.'); break; }
      await addPhoto(files[i], false);
    }
  });
  $('removeUpload').style.display = 'none';
  if (isPhotos) {
    $('blockPhotos').style.display = '';
    $('photosSub').textContent = isStrip ? 'Upload up to 4 photos for your strip. With fewer photos, they repeat to fill the strip.' : 'Upload the photos you want printed. Each photo is printed in the size and package you choose.';
  }

  // ---- uploading a document (PDF / Word) ----
  var pdfJs = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  async function ensurePdfJs() {
    if (window.pdfjsLib) return;
    await loadScript(pdfJs);
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  var pageRun = 0;
  async function renderDocPage() {
    var run = ++pageRun;
    if (!st.doc || !st.doc.pdf) { st.docCanvas = null; renderPreview(); return; }
    var page = await st.doc.pdf.getPage(st.docPage), v0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 1100 / v0.width });
    var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    if (run !== pageRun) return;
    st.docCanvas = c; renderPreview(); updateDocNav();
  }
  function updateDocNav() {
    var show = !!(st.doc && st.doc.pdf && st.doc.pages > 1);
    $('docNav').style.display = show ? '' : 'none';
    if (show) { $('docPageLabel').textContent = 'Page ' + st.docPage + ' of ' + st.doc.pages; $('docPrev').disabled = st.docPage <= 1; $('docNext').disabled = st.docPage >= st.doc.pages; }
  }
  function docPageCount() { return (st.doc && st.doc.pdf) ? st.doc.pages : Math.max(1, Math.min(2000, parseInt($('docPages').value, 10) || 1)); }
  function updateDocInfo() {
    var d = st.doc;
    $('docPagesRow').style.display = (isDoc && d && !d.pdf) ? '' : 'none';
    if (!d) $('docInfo').textContent = '';
    else if (d.pdf) $('docInfo').textContent = d.pages + ' page' + (d.pages > 1 ? 's' : '') + ' found in your PDF.';
    else $('docInfo').textContent = d.ext === 'pdf' ? 'We could not read this PDF here. Please enter the number of pages below.' : 'A preview is not available for Word files. Please enter the number of pages below.';
    updateSummary();
  }
  function clearDoc() { st.doc = null; st.docCanvas = null; st.docPage = 1; $('docName').textContent = ''; $('docRemove').style.display = 'none'; $('docFile').value = ''; updateDocNav(); updateDocInfo(); renderPreview(); }
  $('docPrev').addEventListener('click', function () { if (st.docPage > 1) { st.docPage--; renderDocPage(); } });
  $('docNext').addEventListener('click', function () { if (st.doc && st.docPage < st.doc.pages) { st.docPage++; renderDocPage(); } });
  $('docBtn').addEventListener('click', function () { $('docFile').click(); });
  $('docRemove').addEventListener('click', clearDoc);
  $('docPages').addEventListener('input', updateSummary);
  $('docFile').addEventListener('change', async function (e) {
    var f = e.target.files[0]; e.target.value = ''; if (!f) return;
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'doc', 'docx'].indexOf(ext) === -1) { alert('Please upload a PDF or Word file (.pdf, .doc, .docx).'); return; }
    if (f.size > 25 * 1048576) { alert('That file is larger than 25 MB.'); return; }
    var doc = { name: f.name, ext: ext, path: null, pdf: null, pages: 0 };
    st.doc = doc; st.docPage = 1; st.docCanvas = null;
    $('docName').textContent = f.name + ' (uploading\u2026)'; $('docRemove').style.display = ''; updateDocInfo(); renderPreview();

    st.uploading++;
    var fd = new FormData(); fd.append('doc', f);
    var uploading = hqShopUpload('upload_document', fd).then(function (up) {
      st.uploading--;
      if (st.doc !== doc) return;
      if (!up.ok) { alert(up.error || 'Upload failed.'); clearDoc(); return; }
      doc.path = up.path; $('docName').textContent = f.name;
    });
    if (ext === 'pdf') {
      try {
        await ensurePdfJs();
        doc.pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise; doc.pages = doc.pdf.numPages;
        if (st.doc === doc) { updateDocInfo(); await renderDocPage(); }
      } catch (err) { doc.pdf = null; doc.pages = 0; if (st.doc === doc) updateDocInfo(); }
    }
    await uploading;
  });
  if (isDoc) { $('blockDocument').style.display = ''; }

  // ---- back + inside of a card: the main colour of the design (default), or the same picture ----
  function updateSideStyle() {
    var show = product === 'paper' && !hasCut && kind === 'design' && !!image() && (svc.shapes.indexOf('two-fold') !== -1 || svc.needsTemplate);
    $('sideStyle').style.display = show ? '' : 'none';
  }
  document.querySelectorAll('input[name=sideStyle]').forEach(function (inp) { inp.addEventListener('change', function () { st.backStyle = inp.value; renderPreview(); }); });

  // ---------------- move / zoom the picture inside its frame ----------------
  // (works for the 1x1 / 2x2 / photo sizes, Instax, photo strips, and the circle / triangle / heart / square magnets and keychains)
  function canCrop() { return !isDoc && !!active() && st.cutShape !== 'photo' && (isPhotos || kind === 'design'); }
  function updateCropBtn() { document.querySelectorAll('.js-crop').forEach(function (b) { b.style.display = canCrop() ? '' : 'none'; }); }
  function curTf() { var e = active(); if (!e) return null; if (!e.tf) e.tf = { z: 1, x: 0, y: 0 }; return e.tf; }
  function cropWindow() { var s = size(900); return HQDesign.photoWindow({ w: s.w, h: s.h, frame: svc.frameStyle || '', textPosition: st.cutShape ? 'center' : svc.textPosition, fields: fieldsFor('front'), values: st.values }); }
  var cropGeo = null;
  function syncZoom() { var t = curTf(); if (t) $('cropZoom').value = Math.round(t.z * 100); }
  function drawCrop() {
    var e = active(), tf = curTf(); if (!e || !tf) return;
    var ed = $('cropEditor'), win = cropWindow(), m = 0.14;
    var maxW = Math.max(200, (ed.clientWidth || 480) - 40), maxH = Math.max(200, (ed.clientHeight || 420) - 130);
    var k = Math.min(maxW / (win.w * (1 + 2 * m)), maxH / (win.h * (1 + 2 * m)));
    var ww = Math.max(40, Math.round(win.w * k)), wh = Math.max(40, Math.round(win.h * k)), mg = Math.round(Math.max(ww, wh) * m);
    var c = $('cropCanvas'); c.width = ww + 2 * mg; c.height = wh + 2 * mg;
    var ctx = c.getContext('2d'), img = e.img, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var sc = Math.max(ww / iw, wh / ih) * tf.z, dw = iw * sc, dh = ih * sc, cx = mg + ww / 2 + tf.x * ww, cy = mg + wh / 2 + tf.y * wh;
    ctx.fillStyle = '#e9eef0'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.save(); ctx.globalAlpha = 0.4; ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh); ctx.restore();   // the whole picture, dimmed
    function path() { ctx.save(); ctx.translate(mg, mg); if (st.cutShape) HQDesign.tracePath(ctx, ww, wh, st.cutShape); else { ctx.beginPath(); ctx.rect(0, 0, ww, wh); } }
    path(); ctx.clip(); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ww, wh); ctx.drawImage(img, cx - mg - dw / 2, cy - mg - dh / 2, dw, dh); ctx.restore();   // the part that will be printed
    path(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1E5761'; ctx.stroke(); ctx.restore();
    cropGeo = { ww: ww, wh: wh };
  }
  function setZoom(z) { var t = curTf(); if (!t) return; t.z = Math.max(0.3, Math.min(4, z)); syncZoom(); drawCrop(); schedule(); }
  function openCrop() { if (!canCrop()) return; if (face !== 'front') showFace('front'); cropOpen = true; $('cropEditor').style.display = 'flex'; syncZoom(); drawCrop(); }
  function closeCrop(skip) { cropOpen = false; $('cropEditor').style.display = 'none'; if (!skip) renderPreview(); }
  document.querySelectorAll('.js-crop').forEach(function (b) { b.addEventListener('click', openCrop); });
  $('cropDone').addEventListener('click', function () { closeCrop(); });
  $('cropIn').addEventListener('click', function () { var t = curTf(); if (t) setZoom(t.z + 0.1); });
  $('cropOut').addEventListener('click', function () { var t = curTf(); if (t) setZoom(t.z - 0.1); });
  $('cropZoom').addEventListener('input', function () { setZoom((parseInt(this.value, 10) || 100) / 100); });
  $('cropReset').addEventListener('click', function () { var e = active(); if (e) e.tf = null; syncZoom(); drawCrop(); schedule(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && cropOpen) closeCrop(); });
  var cc = $('cropCanvas'), cptr = {}, pinch0 = 0, pinchZ = 1;
  function pdist() { var k = Object.keys(cptr), a = cptr[k[0]], b = cptr[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y); }
  cc.addEventListener('pointerdown', function (e) { cc.setPointerCapture(e.pointerId); cptr[e.pointerId] = { x: e.clientX, y: e.clientY }; if (Object.keys(cptr).length === 2) { pinch0 = pdist(); pinchZ = curTf().z; } });
  cc.addEventListener('pointermove', function (e) {
    var p = cptr[e.pointerId]; if (!p || !cropGeo) return;
    var n = Object.keys(cptr).length, tf = curTf();
    cptr[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (n === 1) { var r = (cc.getBoundingClientRect().width / cc.width) || 1; tf.x += (e.clientX - p.x) / r / cropGeo.ww; tf.y += (e.clientY - p.y) / r / cropGeo.wh; drawCrop(); schedule(); }
    else if (n === 2 && pinch0 > 0) setZoom(pinchZ * pdist() / pinch0);
  });
  ['pointerup', 'pointercancel'].forEach(function (n) { cc.addEventListener(n, function (e) { delete cptr[e.pointerId]; }); });
  cc.addEventListener('wheel', function (e) { e.preventDefault(); var t = curTf(); if (t) setZoom(t.z * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  // ---------------- shape (keychains, magnets) ----------------
  var SHAPE_NAMES = { circle: 'Circle', triangle: 'Triangle', square: 'Square', heart: 'Heart', photo: 'Follow my photo (background removed)' };
  var cutRun = 0;
  async function computeSubject(useServer) {
    var run = ++cutRun, e = active();
    if (!e) { st.subject = null; st.serverSubject = false; schedule(); return; }
    if (useServer) {
      if (!e.path) { alert('Please wait for your photo to finish uploading.'); return; }
      $('cutStatus').textContent = 'Removing the background\u2026 this can take a few seconds.';
      var rb = await hqShop('remove_bg', { path: e.path });
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
    st.subject = HQDesign.removeBackground(e.img, st.tol);
    schedule();
  }
  if (hasCut) {
    $('blockCut').style.display = '';
    $('cutOptions').innerHTML = cutShapes.map(function (c) {
      return '<label><input type="radio" name="cutShape" value="' + c + '"' + (c === st.cutShape ? ' checked' : '') + '> ' + SHAPE_NAMES[c] + '</label>';
    }).join('');
    var showCutBox = function () { $('bgRemoveBox').style.display = st.cutShape === 'photo' ? '' : 'none'; };
    $('cutOptions').querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        st.cutShape = inp.value; showCutBox(); syncOrient();
        var e = active();
        if (st.cutShape === 'photo' && e && !st.subject) computeSubject(!!(svc.removeBgAvailable && e.path)); else renderPreview();
      });
    });
    $('tolRange').addEventListener('input', debounce(function () { st.tol = parseInt($('tolRange').value, 10); computeSubject(false); }, 200));
    if (svc.removeBgAvailable) { $('aiRemoveBtn').style.display = ''; $('aiRemoveBtn').addEventListener('click', function () { computeSubject(true); }); }
    showCutBox();
    $('previewHint').textContent = viewer ? 'Drag to rotate. The shape follows what you choose below.' : 'This is a preview of the shape you chose.';
  }

  // ---------------- 3. info to print (every text: choose its font and size) ----------------
  var GROUPS = [['front', 'On the front (outside)'], ['inside', 'Inside the card (a folded card; otherwise it goes on the front)'], ['back', 'On the back']];
  if (!svc.infoFields.length) $('blockInfo').style.display = 'none';
  var places = GROUPS.filter(function (g) { return svc.infoFields.some(function (f) { return (f.place || 'front') === g[0]; }); });
  var fontOptions = '<option value="">Default font</option>' + HQDesign.FONTS.map(function (n) { return '<option value="' + esc(n) + '" style="font-family:\'' + esc(n) + '\'">' + esc(n) + '</option>'; }).join('');
  function fieldHtml(f) {
    var lab = '<label for="f_' + f.key + '">' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>';
    var inp = f.type === 'textarea' ? '<textarea id="f_' + f.key + '" data-k="' + f.key + '" maxlength="500"></textarea>'
      : '<input type="' + (f.type === 'date' || f.type === 'time' ? f.type : 'text') + '" id="f_' + f.key + '" data-k="' + f.key + '" maxlength="200">';
    var ctl = '<div class="fld-style"><select data-font="' + f.key + '" aria-label="Font">' + fontOptions + '</select><label>Size <input type="range" min="50" max="200" value="100" data-size="' + f.key + '"><span class="fld-pct" data-pct="' + f.key + '">100%</span></label></div>';
    return '<div class="field">' + lab + inp + ctl + '</div>';
  }
  $('infoBox').innerHTML = places.map(function (g) {
    return (places.length > 1 ? '<h4 class="fld-group">' + g[1] + '</h4>' : '') + svc.infoFields.filter(function (f) { return (f.place || 'front') === g[0]; }).map(fieldHtml).join('');
  }).join('');
  function setStyle(key, patch) {
    var cur = st.styles[key] || { font: '', scale: 1 };
    Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
    if (!cur.font && Math.abs(cur.scale - 1) < 0.01) delete st.styles[key]; else st.styles[key] = cur;
    schedule();
  }
  $('infoBox').querySelectorAll('[data-k]').forEach(function (el) {
    el.addEventListener('input', function () { st.values[el.dataset.k] = el.value; schedule(); });
  });
  $('infoBox').querySelectorAll('[data-font]').forEach(function (el) { el.addEventListener('change', function () { setStyle(el.dataset.font, { font: el.value }); }); });
  $('infoBox').querySelectorAll('[data-size]').forEach(function (el) {
    el.addEventListener('input', function () {
      var pct = parseInt(el.value, 10) || 100;
      $('infoBox').querySelector('[data-pct="' + el.dataset.size + '"]').textContent = pct + '%';
      setStyle(el.dataset.size, { scale: pct / 100 });
    });
  });

  // ---------------- 4. quantity, payment, summary ----------------
  // photos / documents: the total = (photos or pages) x copies
  function units() {
    if (isDoc) return docPageCount() * st.qty;
    if (isPhotos) return (isStrip ? 1 : Math.max(1, st.photos.length)) * st.qty;
    return st.qty;
  }
  function qtyText() {
    if (isDoc) return docPageCount() + ' page' + (docPageCount() > 1 ? 's' : '') + ' \u00D7 ' + st.qty + ' cop' + (st.qty > 1 ? 'ies' : 'y') + ' = ' + units() + ' ' + unitName + (units() > 1 ? 's' : '');
    if (isPhotos) return isStrip ? st.qty + ' strip' + (st.qty > 1 ? 's' : '') : Math.max(1, st.photos.length) + ' photo' + (st.photos.length > 1 ? 's' : '') + ' \u00D7 ' + st.qty + ' = ' + units() + ' ' + unitName + (units() > 1 ? 's' : '');
    return String(st.qty);
  }
  $('qtyLabel').textContent = isDoc ? 'Copies of the whole document' : isPhotos ? (isStrip ? 'Number of photo strips' : 'Copies of each photo') : (unitName !== 'pc' ? 'Quantity (number of ' + unitName + 's)' : 'Quantity');

  function calc() {
    var base = 0, extra = 0, missing = false;
    svc.choices.forEach(function (g) {
      if (isMatrixGroup(g)) return;
      var pick = st.choices[g.name]; g.options.forEach(function (o) { if (o.name === pick) extra += Number(o.price) || 0; });
    });
    if (mGroups.length) {
      var key = mGroups.map(function (gid) {
        var g = svc.choices.filter(function (x) { return x.id === gid; })[0], o = g && g.options.filter(function (x) { return x.name === st.choices[g.name]; })[0];
        return o ? o.id : '';
      }).join('|');
      base = Number(prices[key]) || 0; if (base <= 0) missing = true;
    } else base = parseFloat(((String(svc.priceText).match(/\d+(\.\d+)?/)) || ['0'])[0]) || 0;
    var unit = base + extra, totalC = Math.round(unit * units() * 100);
    var dueC = st.payOption === 'full' ? totalC : Math.ceil(totalC * svc.downpaymentPercent / 100);
    return { unit: unit, total: totalC / 100, due: dueC / 100, balance: (totalC - dueC) / 100, missing: missing };
  }
  function updateSummary() {
    var c = calc();
    $('qtyHint').textContent = (isDoc || isPhotos) ? qtyText() : '';
    if (c.total <= 0) {
      $('summary').innerHTML = '<div class="summary-row">' + (c.missing ? 'The price for this choice is not set yet. Please pick another option, or contact us.' : 'This service has no price yet. Please contact us to order.') + '</div>'; $('payBtn').disabled = true; $('payBtn').textContent = 'Not available'; return;
    }
    $('summary').innerHTML =
      '<div class="summary-row"><span>Price per ' + esc(unitName) + '</span><span>' + peso(c.unit) + '</span></div>' +
      '<div class="summary-row"><span>Quantity</span><span>' + esc(qtyText()) + '</span></div>' +
      '<div class="summary-row is-total"><span>Total</span><span>' + peso(c.total) + '</span></div>' +
      '<div class="summary-row is-due"><span>' + (st.payOption === 'full' ? 'Pay now' : 'Pay now (' + svc.downpaymentPercent + '% down payment)') + '</span><span>' + peso(c.due) + '</span></div>' +
      (c.balance > 0 ? '<div class="summary-row"><span>Balance (pay on pickup / delivery)</span><span>' + peso(c.balance) + '</span></div>' : '') +
      (st.fulfillment === 'delivery' ? '<div class="summary-row"><span>Lalamove delivery fee</span><span>Added when packing</span></div>' : '');
    $('payBtn').disabled = false;
    $('payBtn').textContent = 'Pay ' + peso(c.due) + ' with GCash / PayMaya';
  }
  $('optDownLabel').textContent = svc.downpaymentPercent + '% down payment';
  $('qty').addEventListener('input', function () { st.qty = Math.max(1, Math.min(100000, parseInt(this.value, 10) || 1)); updateSummary(); });
  document.querySelectorAll('input[name=payOption]').forEach(function (inp) { inp.addEventListener('change', function () { st.payOption = inp.value; updateSummary(); }); });

  // contact number, pickup or delivery (the Lalamove fee is asked later, when the order is packing)
  function syncFulfillment() { $('deliveryFields').style.display = st.fulfillment === 'delivery' ? '' : 'none'; updateSummary(); }
  document.querySelectorAll('input[name=fulfillment]').forEach(function (inp) { inp.addEventListener('change', function () { st.fulfillment = inp.value; syncFulfillment(); }); });
  hqApi('profile').then(function (pr) {
    if (!pr.ok) return;
    $('contactPhone').value = pr.profile.contactNo; $('delName').value = pr.profile.firstName + ' ' + pr.profile.lastName;
    $('delAddress').value = pr.profile.address || ''; $('delLandmark').value = pr.profile.landmark || '';
  });

  function snapshot() {
    var s = size(1200), c = document.createElement('canvas');
    HQDesign.draw(c, Object.assign(baseOpts(s), { placeholders: false, mode: 'cover' }));
    try { return c.toDataURL('image/png'); } catch (e) { return ''; }
  }
  function snapshotBack() {   // the back (same design as the front) so the admin can see and print it
    if (isDoc || isPhotos) return '';
    if (st.cutShape) { try { return cv.back.toDataURL('image/png'); } catch (e) { return ''; } }   // keychain / magnet back
    if (product !== 'paper') return '';
    var bf = fieldsFor('back');
    if (!spec() && !image() && !bf.length) return '';
    var s = size(1200), c = document.createElement('canvas');
    HQDesign.draw(c, { w: s.w, h: s.h, spec: spec(), image: image(), backStyle: st.backStyle, mode: 'back', product: product, fields: bf, values: st.values, styles: st.styles, placeholders: false, mono: isMono() });
    try { return c.toDataURL('image/png'); } catch (e) { return ''; }
  }
  function snapshotInside() {   // both inside pages of a folded card in one picture
    if (!folded()) return '';
    var il = fieldsFor('inside'), side = sideImg('inside');
    if (!spec() && !image() && !side && !il.length) return '';
    var s = size(900), vert = st.orientation === 'landscape', L = document.createElement('canvas'), R = document.createElement('canvas'), out = document.createElement('canvas');
    var o = { w: s.w, h: s.h, spec: spec(), image: image(), backStyle: st.backStyle, fields: il, values: st.values, styles: st.styles, placeholders: false, sideImage: side, split: vert ? 'v' : 'h', product: product, mono: isMono() };
    HQDesign.draw(L, Object.assign({}, o, { mode: 'inside-left' })); HQDesign.draw(R, Object.assign({}, o, { mode: 'inside-right' }));
    out.width = vert ? s.w : s.w * 2; out.height = vert ? s.h * 2 : s.h;
    var x = out.getContext('2d'); x.drawImage(L, 0, 0); x.drawImage(R, vert ? 0 : s.w, vert ? s.h : 0);
    try { return out.toDataURL('image/png'); } catch (e) { return ''; }
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
    if (st.uploading > 0) { alert('Your file is still uploading. Please wait a moment.'); return; }

    var design;
    if (isDoc) {
      if (!st.doc || !st.doc.path) { alert('Please upload the document you want printed.'); return; }
      design = { source: 'document', path: st.doc.path, name: st.doc.name, pages: docPageCount(), copies: st.qty };
    } else if (isPhotos) {
      if (!st.photos.length) { alert('Please upload at least one photo.'); return; }
      design = { source: 'photos', copies: st.qty, photos: st.photos.map(function (p) { return { path: p.path, original: p.orig || null, name: p.name, aiPrompt: p.aiPrompt || '', crop: p.tf || null }; }) };
    } else {
      var up = active();
      design = up ? { source: 'upload', path: up.path, original: up.orig || null, aiPrompt: up.aiPrompt || '', crop: up.tf || null } : st.templateId ? { source: 'template', templateId: st.templateId } : (st.spec && st.prompt) ? { source: 'ai', prompt: st.prompt, spec: st.spec } : { source: 'none' };
      if (hasCut && st.cutShape === 'photo' && !st.subject) { alert('Please upload your photo first.'); return; }
      if (hasCut && design.source === 'none') { alert('Please upload your photo, or choose a design.'); return; }
      if (svc.needsTemplate && design.source === 'none') { alert('Please choose a template, describe a design, or upload your own.'); return; }
      var sides = {};
      ['back', 'inside'].forEach(function (k) { var e = st.extra[k]; if (e && e.path) sides[k] = { path: e.path }; });
      if (Object.keys(sides).length) design.sides = sides;
    }

    var btn = $('payBtn'); btn.disabled = true; btn.textContent = 'Taking you to PayMongo\u2026';
    var keepPictures = !isDoc && (!isPhotos || isStrip);
    var res = await hqShop('create_order', {
      serviceId: svc.id, qty: units(), payOption: st.payOption, shape: st.shape, orientation: st.orientation, cutShape: st.cutShape,
      contactPhone: $('contactPhone').value, fulfillment: st.fulfillment,
      delivery: st.fulfillment === 'delivery' ? { name: $('delName').value, address: $('delAddress').value, landmark: $('delLandmark').value } : null,
      info: st.values, design: design,
      selections: Object.keys(st.choices).map(function (k) { return { group: k, option: st.choices[k] }; }),
      notes: $('notes').value, previewPng: keepPictures ? snapshot() : '', previewBackPng: snapshotBack(), previewInsidePng: snapshotInside(), styles: st.styles
    });
    if (!res.ok) { alert(res.error || 'Could not place the order.'); updateSummary(); return; }
    window.location.href = res.checkoutUrl;
  });

  lockAi(); renderThumbs(); updateDocInfo(); syncFulfillment(); updateSideStyle();
  HQDesign.loadFonts().then(renderPreview);
  renderPreview();
});
