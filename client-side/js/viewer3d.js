// 3D product viewer (Three.js r128). Shows both sides, and looks like the real product:
//  paper card (no fold / two-fold), photo paper, sticker, flexible magnet (thick, dark back), acrylic keychain (ring + chain).
// Drag to rotate. setFace('back') turns it around.
(function () {
  // thickness, edge colour, glossy front
  var KINDS = {
    paper:    { t: 0.03,  edge: 0xf1ece0, gloss: false },
    photo:    { t: 0.016, edge: 0xfbfbfa, gloss: true },
    sticker:  { t: 0.012, edge: 0xf4f1ea, gloss: true },
    magnet:   { t: 0.075, edge: 0x3a3a40, gloss: true },
    keychain: { t: 0.05,  edge: 0xdfeaee, gloss: true }
  };

  function create(container, opts) {
    var THREE = window.THREE;
    if (!THREE) return null;
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return null; }

    var rw = opts.w, rh = opts.h, shape = opts.shape || 'no-fold', product = opts.product || 'paper', hole = null, hinge = 'side';
    var tex = {}, openAmt = 0, openTarget = 0, rotX = -0.1, rotY = 0.38, rotYT = 0.38, dragging = false, last = null, card = null, alive = true;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    var key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(2.5, 3, 5); scene.add(key);
    var fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-3, -1, 3); scene.add(fill);
    var rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(0, 2, -5); scene.add(rim);   // lights the back side too
    var root = new THREE.Group(); scene.add(root);

    function kind() { return KINDS[product] || KINDS.paper; }
    function dims() { var s = 2.4 / Math.max(rw, rh); return { w: rw * s, h: rh * s, t: kind().t }; }
    function hasChain() { return product === 'keychain' && shape === 'cutout' && !!hole; }

    function face(canvas, fallback, glossy, rot) {
      var m = glossy
        ? new THREE.MeshPhysicalMaterial({ color: canvas ? 0xffffff : fallback, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 })
        : new THREE.MeshStandardMaterial({ color: canvas ? 0xffffff : fallback, roughness: 0.7, metalness: 0 });
      if (canvas) { var t = new THREE.CanvasTexture(canvas); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); if (rot) { t.center.set(0.5, 0.5); t.rotation = Math.PI; } m.map = t; }
      return m;
    }
    function cut(m, double) { m.transparent = true; m.alphaTest = 0.08; m.side = double ? THREE.DoubleSide : THREE.FrontSide; return m; }
    function metal() { return new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.75, roughness: 0.28 }); }
    function disposeObj(o) { o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); if (n.material) [].concat(n.material).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); }); }

    // ring + chain + big key ring hanging from the hole
    function addChain(group, d) {
      var x = (hole.fx - 0.5) * d.w, y = (0.5 - hole.fy) * d.h, mat = metal(), g = new THREE.Group();
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 12, 36), mat); ring.rotation.y = Math.PI / 2; ring.position.set(x, y + 0.035, 0); g.add(ring);
      var i, linkY = y + 0.13;
      for (i = 0; i < 5; i++) {
        var link = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 10, 24), mat);
        link.scale.set(1, 1.5, 1); link.rotation.y = i % 2 ? 0 : Math.PI / 2; link.position.set(x, linkY, 0); g.add(link); linkY += 0.085;
      }
      var big = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.016, 12, 48), mat); big.rotation.y = 0.5; big.position.set(x, linkY + 0.22, 0); g.add(big);
      group.add(g);
    }

    function build() {
      if (card) { root.remove(card); disposeObj(card); }
      card = new THREE.Group();
      var K = kind(), d = dims(), side = new THREE.MeshStandardMaterial({ color: K.edge, roughness: product === 'magnet' ? 0.95 : 0.85 });
      if (shape === 'two-fold') {
        var top = hinge === 'top';   // landscape cards fold along the top edge and open upward
        var base = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.t), [side, side, side, side, face(tex.insideR, 0xfffdf8, false), face(tex.back, 0xfffdf8, false)]);
        var pivot = new THREE.Group(), cover = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.t), [side, side, side, side, face(tex.cover, 0xffffff, false), face(tex.insideL, 0xfffdf8, false, top)]);
        if (top) { base.position.set(0, 0, 0); pivot.position.set(0, d.h / 2, d.t * 1.05); cover.position.set(0, -d.h / 2, 0); }
        else { base.position.x = d.w / 2; pivot.position.z = d.t * 1.05; cover.position.x = d.w / 2; }
        card.add(base); pivot.add(cover); card.add(pivot); card.userData.pivot = pivot; card.userData.top = top;
      } else if (shape === 'cutout') {   // keychain / magnet / sticker cut to a shape: front, thin edge layers, back
        var half = d.t / 2;
        var front = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), cut(face(tex.cover, 0xffffff, K.gloss), false)); front.position.z = half;
        var back = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), cut(face(tex.back, K.edge, false), false)); back.rotation.y = Math.PI; back.position.z = -half;
        card.add(front); card.add(back);
        if (d.t > 0.02) {                // stacked layers = the thickness of the piece
          var n = 9, i;
          for (i = 1; i < n; i++) {
            var layer = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), cut(face(tex.edge, K.edge, false), true));
            layer.position.z = -half + d.t * i / n; card.add(layer);
          }
        }
        if (hasChain()) { addChain(card, d); card.position.y = -0.5; } else card.position.y = 0;
      } else {                           // a flat piece with real thickness
        card.add(new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.t), [side, side, side, side, face(tex.cover, 0xffffff, K.gloss), face(tex.back, K.edge, false)]));
      }
      root.add(card); fit();
    }

    function fit() {
      var d = dims(), a = camera.aspect || 1, fold = shape === 'two-fold', topFold = fold && hinge === 'top';
      var wide = (fold && !topFold) ? d.w * 2 : d.w, extra = hasChain() ? 1.1 : 0;
      var needH = ((topFold ? d.h * 2 : d.h) + extra) * 1.25, needW = wide * 1.2 / a, half = Math.max(needH, needW) / 2;
      camera.position.set(0, 0, half / Math.tan(camera.fov * Math.PI / 360));
    }

    function resize() {
      var w = container.clientWidth || 300, h = container.clientHeight || 300;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); fit();
    }

    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function frame() {
      if (!alive) return;
      requestAnimationFrame(frame);
      openAmt += (openTarget - openAmt) * 0.1;
      if (Math.abs(openTarget - openAmt) < 0.001) openAmt = openTarget;
      if (card && card.userData.pivot) {
        var e = ease(openAmt), d = dims();
        if (card.userData.top) { card.userData.pivot.rotation.x = -Math.PI * e; card.position.x = 0; card.position.y = -d.h / 2 * e; }
        else { card.userData.pivot.rotation.y = -Math.PI * e; card.position.x = -d.w / 2 * (1 - e); }
      } else if (card) card.position.x = 0;
      if (!dragging) rotY += (rotYT - rotY) * 0.12;
      root.rotation.x = rotX; root.rotation.y = rotY;
      renderer.render(scene, camera);
    }

    var el = renderer.domElement;
    el.addEventListener('pointerdown', function (e) { dragging = true; last = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; });
    el.addEventListener('pointermove', function (e) { if (!dragging) return; rotY += (e.clientX - last[0]) * 0.01; rotX += (e.clientY - last[1]) * 0.01; rotX = Math.max(-0.9, Math.min(0.9, rotX)); last = [e.clientX, e.clientY]; });
    ['pointerup', 'pointercancel'].forEach(function (n) { el.addEventListener(n, function () { dragging = false; rotYT = rotY; el.style.cursor = 'grab'; }); });

    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(container); else window.addEventListener('resize', resize);
    resize(); build(); frame();

    return {
      setTextures: function (t) { tex = t || {}; build(); },
      setShape: function (s) { if (s !== shape) { shape = s; openTarget = 0; openAmt = 0; build(); } },
      setSize: function (w, h) { if (w === rw && h === rh) return; rw = w; rh = h; build(); },
      setProduct: function (p, h) { product = p || 'paper'; hole = h || null; },
      setHinge: function (h) { hinge = h === 'top' ? 'top' : 'side'; },
      setOpen: function (b) { openTarget = b ? 1 : 0; },
      isOpen: function () { return openTarget === 1; },
      setFace: function (f) { var base = Math.round((rotY - 0.38) / (2 * Math.PI)) * 2 * Math.PI; rotYT = base + 0.38 + (f === 'back' ? Math.PI : 0); },
      resetView: function () { rotX = -0.1; rotYT = 0.38; },
      destroy: function () { alive = false; if (ro) ro.disconnect(); disposeObj(root); renderer.dispose(); if (el.parentNode) el.parentNode.removeChild(el); }
    };
  }
  window.HQViewer = { create: create };
})();
