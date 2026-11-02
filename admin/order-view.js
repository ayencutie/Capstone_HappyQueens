// Admin: view the customer's product (full screen, 3D when the service has a 3D preview) and print it.
hqOnReady(async function () {
  var $ = function (id) { return document.getElementById(id); }, esc = hqEsc;
  function loadImg(src) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
  function toCanvas(img) { var c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; c.getContext('2d').drawImage(img, 0, 0); return c; }
  function blank(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function num(x) { return Number(Number(x).toFixed(1)); }

  var id = new URLSearchParams(location.search).get('id') || 0;
  var r = await hqAdmin('orders', undefined, { id: id });
  if (!r.ok || !r.orders || !r.orders.length) { $('ovMsg').textContent = r.error || 'Order not found.'; return; }
  var o = r.orders[0], d = o.details || {}, des = d.design || {}, product = o.product || 'paper';
  document.title = o.id + ' \u00B7 ' + o.service + ' \u2014 Admin';
  $('ovTitle').textContent = o.id + ' \u00B7 ' + o.service;
  $('ovSub').textContent = o.customer + ' \u00B7 qty ' + o.qty;
  $('ovMsg').textContent = '';

  // the real size of the size the customer chose (so it can be printed at actual size)
  var sres = await hqAdmin('services'), svc = sres.ok ? sres.services.filter(function (s) { return s.id === o.serviceId; })[0] : null;
  var landscape = d.orientation === 'landscape';
  function realSize() {
    if (!svc) return null;
    var g = svc.choices.filter(function (x) { return x.role === 'size'; })[0];
    if (!g) return null;
    var sel = (d.selections || []).filter(function (s) { return s.group === g.name; })[0];
    var opt = sel && g.options.filter(function (x) { return x.name === sel.option; })[0];
    if (!opt || !(opt.w > 0 && opt.h > 0)) return null;
    var k = g.unit === 'in' ? 25.4 : g.unit === 'cm' ? 10 : 1, a = opt.w * k, b = opt.h * k, L = Math.max(a, b), S = Math.min(a, b);
    return { w: landscape ? L : S, h: landscape ? S : L, label: opt.name + ' \u2014 ' + num(opt.w) + ' \u00D7 ' + num(opt.h) + ' ' + (g.unit || 'mm') };
  }
  var size = realSize();
  var facts = ['<span>Qty: <b>' + o.qty + '</b></span>'];
  if (size) facts.push('<span>Size: <b>' + esc(size.label) + '</b></span>');
  if (d.shape) facts.push('<span>Card: <b>' + (d.shape === 'two-fold' ? 'Two-fold' : 'No fold') + (d.orientation ? ' \u00B7 ' + d.orientation : '') + '</b></span>');
  if (d.cutShape) facts.push('<span>Cut shape: <b>' + esc(d.cutShape) + '</b></span>');
  $('ovFoot').innerHTML = facts.join('');

  // ---------------- printing ----------------
  function waitImages(root) { return Promise.all(Array.prototype.map.call(root.querySelectorAll('img'), function (im) { return im.complete ? Promise.resolve() : new Promise(function (res) { im.onload = im.onerror = res; }); })); }
  var printPages = [];   // [{label, src, wmm, hmm}]
  async function doPrint() {
    var actual = $('ovSize').value === 'actual' && size;
    // only the product: no label, no text (the page margin is 0 so the browser adds no header / footer either)
    $('printArea').innerHTML = printPages.map(function (p) {
      var st = (actual && p.wmm) ? 'width:' + p.wmm + 'mm;height:' + p.hmm + 'mm;max-width:none;max-height:none;' : '';
      return '<section class="print-page"><img src="' + esc(p.src) + '" alt="" style="' + st + '"></section>';
    }).join('');
    await waitImages($('printArea'));
    var first = $('printArea').querySelector('img'), land = !!first && first.naturalWidth > first.naturalHeight;
    $('printArea').className = 'print-area ' + (land ? 'is-landscape' : 'is-portrait');
    var ps = document.getElementById('ovPageStyle') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'ovPageStyle' }));
    ps.textContent = '@page { size: ' + (land ? 'landscape' : 'portrait') + '; margin: 0; }';
    window.print();
  }
  $('ovPrint').addEventListener('click', function () { if (printPages.length) doPrint(); });
  if (size) $('ovSize').style.display = '';

  // full screen
  function syncFull() { $('ovFull').innerHTML = document.fullscreenElement ? '<i class="fa-solid fa-compress"></i> Exit full screen' : '<i class="fa-solid fa-expand"></i> Full screen'; }
  $('ovFull').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  });
  document.addEventListener('fullscreenchange', syncFull);
  $('ovBg').addEventListener('input', function () { $('ovStage').style.background = this.value; });

  var kind = o.uploadKind;

  // ---------------- an uploaded document: nothing to preview, the file is what gets printed ----------------
  if (kind === 'document') {
    $('ovFaces').style.display = 'none'; $('ovFull').style.display = 'none'; $('ovBg').style.display = 'none'; $('ovPrint').disabled = true;
    $('ovMsg').innerHTML = '<p><i class="fa-solid fa-file-lines" style="font-size:42px;color:#9ed2db"></i></p><p style="margin-top:14px">Document: <b>' + esc(des.name || 'file') + '</b><br>' + (des.pages || 1) + ' page(s) \u00D7 ' + (des.copies || 1) + ' copies</p>' +
      '<p style="margin-top:12px"><a href="' + esc(hqAsset(des.file || '')) + '" download>Download the file</a>, then print it from your PDF / Word program.</p>';
    $('ovMsg').style.pointerEvents = 'auto';
    return;
  }

  // ---------------- several photos: show each, print each ----------------
  if (kind === 'photos' && o.frameStyle !== 'strip') {
    var photos = des.photos || [];
    $('ovFaces').style.display = 'none';
    $('ovStage').classList.add('is-gallery');
    function orderMono() {   // "black & white" print
      var g = svc && svc.choices.filter(function (x) { return x.role === 'color'; })[0];
      var sel = g && (d.selections || []).filter(function (s) { return s.group === g.name; })[0], opt = sel && g.options.filter(function (x) { return x.name === sel.option; })[0];
      return !!(opt && opt.mono);
    }
    var mono = orderMono(), made = [];
    var pfields = (svc && svc.infoFields ? svc.infoFields : []).filter(function (f) { return (f.place || 'front') === 'front'; }), pvals = {};
    (d.info || []).forEach(function (r) { var f = pfields.filter(function (x) { return x.label === r.label; })[0]; if (f) pvals[f.key] = r.value; });
    for (var pi = 0; pi < photos.length; pi++) {   // draw each photo the way the customer framed it (moved / zoomed), at the size they chose
      var ph = photos[pi], src = hqAsset(ph.file), im = await loadImg(src);
      if (im && size) {
        var long = 1600, cw = size.w >= size.h ? long : Math.round(long * size.w / size.h), ch = size.h >= size.w ? long : Math.round(long * size.h / size.w), cvs = blank(cw, ch);
        HQDesign.draw(cvs, { w: cw, h: ch, image: im, tf: ph.crop || null, frame: o.frameStyle || '', mode: 'cover', fields: pfields, values: pvals, styles: d.styles || {}, textPosition: svc && svc.textPosition, placeholders: false, mono: mono });
        src = cvs.toDataURL('image/png');
      }
      made.push({ p: ph, src: src });
    }
    $('ovStage').innerHTML = made.map(function (m) { return '<div class="ov-photo"><a href="' + esc(hqAsset(m.p.file)) + '" target="_blank" rel="noopener" title="Open the original photo"><img src="' + esc(m.src) + '" alt=""></a>' + esc(m.p.name || '') + (m.p.crop ? '<br>(moved / zoomed by the customer)' : '') + (m.p.aiPrompt ? '<br>AI: ' + esc(m.p.aiPrompt) : '') + '</div>'; }).join('') || '<p class="ov-msg">No photos.</p>';
    printPages = made.map(function (m, i) { return { label: 'Photo ' + (i + 1) + ' of ' + made.length + ' (print ' + (des.copies || 1) + ' cop' + ((des.copies || 1) > 1 ? 'ies' : 'y') + ')', src: m.src, wmm: size && size.w, hmm: size && size.h }; });
    return;
  }

  // ---------------- the product (flat pictures or 3D) ----------------
  var frontPath = o.designImage || (des.source === 'upload' || des.source === 'template' ? des.file : null);
  var frontImg = frontPath ? await loadImg(hqAsset(frontPath)) : null;
  if (!frontImg) { $('ovMsg').textContent = 'No picture of this product was saved with the order. Open the order to see the details.'; $('ovFaces').style.display = 'none'; $('ovFull').style.display = 'none'; $('ovPrint').disabled = true; return; }
  var backImg = o.designBackImage ? await loadImg(hqAsset(o.designBackImage)) : null;
  var insideImg = o.designInsideImage ? await loadImg(hqAsset(o.designInsideImage)) : null;

  var cut = d.cutShape || null, folded = d.shape === 'two-fold' && !cut && product === 'paper';
  var cover = toCanvas(frontImg), W = cover.width, H = cover.height;
  var EDGE = { paper: '#f1ece0', photo: '#fbfbfa', sticker: '#f4efe6', magnet: '#3a3a40', keychain: '#dfeaee' };
  var back, edge = null, insideL = null, insideR = null, insideAll = null;

  if (cut) {
    if (backImg) back = toCanvas(backImg);
    else {   // not saved: build it the way the order page does
      back = blank(W, H); var bx = back.getContext('2d');
      if (o.doubleSided) { bx.save(); bx.translate(W, 0); bx.scale(-1, 1); bx.drawImage(cover, 0, 0); bx.restore(); }
      else { var t = blank(W, H); HQDesign.draw(t, { w: W, h: H, mode: 'back', product: product }); bx.drawImage(t, 0, 0); bx.globalCompositeOperation = 'destination-in'; bx.save(); bx.translate(W, 0); bx.scale(-1, 1); bx.drawImage(cover, 0, 0); bx.restore(); bx.globalCompositeOperation = 'source-over'; }
    }
    edge = blank(W, H); var ex = edge.getContext('2d'); ex.drawImage(cover, 0, 0); ex.globalCompositeOperation = 'source-in'; ex.fillStyle = EDGE[product] || EDGE.paper; ex.fillRect(0, 0, W, H);
  } else if (backImg) back = toCanvas(backImg);
  else { back = blank(W, H); HQDesign.draw(back, { w: W, h: H, mode: 'back', product: product }); }

  if (folded) {
    if (insideImg) {   // the saved inside picture holds both pages: left + right (or top + bottom for a landscape card)
      var all = toCanvas(insideImg), hw = landscape ? all.width : Math.floor(all.width / 2), hh = landscape ? Math.floor(all.height / 2) : all.height;
      insideL = blank(hw, hh); insideR = blank(hw, hh);
      insideL.getContext('2d').drawImage(all, 0, 0, hw, hh, 0, 0, hw, hh);
      insideR.getContext('2d').drawImage(all, landscape ? 0 : hw, landscape ? hh : 0, hw, hh, 0, 0, hw, hh);
      insideAll = all;
    } else {
      insideL = blank(W, H); insideR = blank(W, H);
      HQDesign.draw(insideL, { w: W, h: H, mode: 'inside-left', product: product }); HQDesign.draw(insideR, { w: W, h: H, mode: 'inside-right', product: product });
      insideAll = blank(landscape ? W : W * 2, landscape ? H * 2 : H); var ix = insideAll.getContext('2d');
      ix.drawImage(insideL, 0, 0); ix.drawImage(insideR, landscape ? 0 : W, landscape ? H : 0);
    }
  }

  // What gets printed. A folded card is ONE long sheet: the outside has the back and the front together (print it, then fold),
  // and the inside is printed on the back of the same sheet. Other products: front (and back) as they are.
  if (folded) {
    var os = blank(landscape ? W : W * 2, landscape ? H * 2 : H), ox = os.getContext('2d');
    ox.fillStyle = '#ffffff'; ox.fillRect(0, 0, os.width, os.height);
    if (landscape) {   // top-fold card: the back is the top half, upside-down, so it reads upright after folding
      ox.save(); ox.translate(W / 2, H / 2); ox.rotate(Math.PI); ox.drawImage(back, -W / 2, -H / 2, W, H); ox.restore();
      ox.drawImage(cover, 0, H, W, H);
    } else {           // side-fold card: back on the left, front on the right
      ox.drawImage(back, 0, 0, W, H); ox.drawImage(cover, W, 0, W, H);
    }
    var sw = size && (landscape ? size.w : size.w * 2), sh = size && (landscape ? size.h * 2 : size.h);
    var outsideSrc = os.toDataURL('image/png'), insideSrc = insideAll.toDataURL('image/png');
    printPages.push({ label: 'ONE sheet, OUTSIDE (back and front together). Print this side, then fold', src: outsideSrc, wmm: sw, hmm: sh });
    printPages.push({ label: 'INSIDE (both pages). Print on the back of the same sheet (flip on the ' + (landscape ? 'short' : 'long') + ' edge)', src: insideSrc, wmm: sw, hmm: sh });
    $('ovSheet').innerHTML = '<figure><img src="' + outsideSrc + '" alt=""><figcaption><b>Outside</b>: ' + (landscape ? 'back (upside-down) on top, front below' : 'back on the left, front on the right') + '. One page; fold in the middle.</figcaption></figure>' +
      '<figure><img src="' + insideSrc + '" alt=""><figcaption><b>Inside</b>: printed on the back of the same sheet.</figcaption></figure>';
  } else {
    printPages.push({ label: 'Front', src: hqAsset(frontPath), wmm: size && size.w, hmm: size && size.h });
    if (o.designBackImage && (!cut || o.doubleSided)) printPages.push({ label: 'Back', src: hqAsset(o.designBackImage), wmm: size && size.w, hmm: size && size.h });
  }

  // viewer: 3D when the service has a 3D preview, otherwise flat pictures
  var viewer = null, stage = $('ovStage'), face = 'front';
  stage.style.background = $('ovBg').value;
  if (o.previewMode === '3d') viewer = HQViewer.create(stage, { w: W, h: H, ref: 0, shape: cut ? 'cutout' : folded ? 'two-fold' : 'no-fold', product: product });
  var flat = {};
  if (viewer) {
    viewer.setHinge(landscape ? 'top' : 'side');
    viewer.setProduct(product, (cut && o.cutHole) ? HQDesign.holePos(cut, W, H) : null);
    viewer.setTextures({ cover: cover, back: back, edge: edge, insideL: insideL, insideR: insideR });
    $('ovReset').style.display = ''; $('ovReset').addEventListener('click', function () { viewer.resetView(); });
  } else {
    [['front', cover], ['back', back], ['inside', insideAll]].forEach(function (p) {
      if (!p[1]) return; p[1].className = 'ov-flat'; p[1].style.display = p[0] === 'front' ? '' : 'none'; stage.appendChild(p[1]); flat[p[0]] = p[1];
    });
  }

  function showFace(f) {
    face = f;
    $('ovSheet').style.display = face === 'sheet' ? 'flex' : 'none';
    $('ovFaces').querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-active', b.dataset.f === face); });
    if (viewer) { viewer.setFace(face === 'back' ? 'back' : 'front'); viewer.setOpen(face === 'inside'); $('ovOpen').textContent = face === 'inside' ? 'Close card' : 'Open card'; }
    else Object.keys(flat).forEach(function (k) { flat[k].style.display = k === face ? '' : 'none'; });
  }
  var faces = [['front', 'Front'], ['back', 'Back']]; if (folded) { faces.splice(1, 0, ['inside', 'Inside']); faces.push(['sheet', 'Print layout']); }
  $('ovFaces').innerHTML = faces.map(function (f) { return '<button type="button" data-f="' + f[0] + '" class="' + (f[0] === 'front' ? 'is-active' : '') + '">' + f[1] + '</button>'; }).join('');
  $('ovFaces').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { showFace(b.dataset.f); }); });
  if (viewer && folded) { $('ovOpen').style.display = ''; $('ovOpen').addEventListener('click', function () { showFace(viewer.isOpen() ? 'front' : 'inside'); }); }
});
