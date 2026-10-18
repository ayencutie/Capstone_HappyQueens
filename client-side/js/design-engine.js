// Draws a product design (background, pattern, border, customer text) on a <canvas>.
// Used for the flat preview, as the texture of the 3D card, and for the picture saved with the order.
(function () {
  var FONTS = ['Playfair Display', 'Great Vibes', 'Dancing Script', 'Poppins', 'Baloo 2', 'Work Sans'];
  var SCRIPT_FONTS = ['Great Vibes', 'Dancing Script'];

  // ---------- tiny helpers ----------
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function rgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function hex(a) { return '#' + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }
  function lum(h) { var c = rgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function alpha(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  // ---------- built-in "AI" designer (works with no internet / no API key) ----------
  var THEMES = [
    { k: ['wedding', 'bride', 'groom', 'nuptial', 'marriage', 'kasal'], bg: ['#fdf8f0', '#f6e9d7'], accent: '#b8914a', text: '#4a3b2a', pattern: 'florals', pc: '#d9bd8a', border: 'ornate', hf: 'Great Vibes', bf: 'Playfair Display' },
    { k: ['debut', '18th', 'eighteenth', 'princess', 'quinceanera', 'sweet'], bg: ['#3b1d5a', '#7b3fa0'], accent: '#f3c6d0', text: '#ffffff', pattern: 'sparkles', pc: '#f3d9a4', border: 'double', hf: 'Great Vibes', bf: 'Playfair Display' },
    { k: ['birthday', 'bday', 'party', 'celebration', 'kaarawan'], bg: ['#fff3d6', '#ffd9e6'], accent: '#e0457b', text: '#3b2a4a', pattern: 'confetti', pc: '#4f8cff', border: 'none', hf: 'Baloo 2', bf: 'Poppins' },
    { k: ['baby', 'christening', 'baptism', 'binyag', 'shower', 'newborn', 'dedication'], bg: ['#eaf4ff', '#fdf0f5'], accent: '#6aa6d9', text: '#35506b', pattern: 'stars', pc: '#bcd9f0', border: 'dashed', hf: 'Dancing Script', bf: 'Poppins' },
    { k: ['anniversary', 'love', 'valentine', 'romantic', 'heart'], bg: ['#5e1224', '#8c1d3a'], accent: '#f0c27b', text: '#fff4e8', pattern: 'hearts', pc: '#c04a62', border: 'solid', hf: 'Great Vibes', bf: 'Playfair Display' },
    { k: ['corporate', 'business', 'company', 'office', 'professional', 'formal', 'seminar', 'conference', 'meeting'], bg: ['#ffffff', '#e8eef5'], accent: '#1f3a5f', text: '#1f2d3d', pattern: 'grid', pc: '#b9c7d8', border: 'solid', hf: 'Poppins', bf: 'Work Sans' },
    { k: ['christmas', 'xmas', 'holiday', 'noel', 'pasko'], bg: ['#0f4c2e', '#1f7a47'], accent: '#e5c26a', text: '#ffffff', pattern: 'stars', pc: '#ffffff', border: 'double', hf: 'Great Vibes', bf: 'Poppins' },
    { k: ['halloween', 'spooky', 'horror'], bg: ['#1b1b2b', '#3a2250'], accent: '#ff8a1f', text: '#ffffff', pattern: 'stars', pc: '#ff8a1f', border: 'solid', hf: 'Baloo 2', bf: 'Poppins' },
    { k: ['tropical', 'beach', 'summer', 'island', 'ocean', 'sea'], bg: ['#d8f5ee', '#fff3c9'], accent: '#0f9d8a', text: '#134e4a', pattern: 'waves', pc: '#7fd3c5', border: 'none', hf: 'Dancing Script', bf: 'Poppins' },
    { k: ['kids', 'kid', 'cartoon', 'dino', 'unicorn', 'superhero', 'fun', 'playful'], bg: ['#e4f6ff', '#fff2c2'], accent: '#ff6b6b', text: '#2b3a67', pattern: 'confetti', pc: '#ff6b6b', border: 'dashed', hf: 'Baloo 2', bf: 'Poppins' },
    { k: ['rustic', 'vintage', 'boho', 'antique', 'retro'], bg: ['#f3e6d3', '#e6d0b1'], accent: '#8a5a2b', text: '#4a3420', pattern: 'florals', pc: '#c9a77c', border: 'solid', hf: 'Playfair Display', bf: 'Work Sans' },
    { k: ['minimal', 'simple', 'clean', 'modern', 'elegant'], bg: ['#ffffff', '#f4f4f4'], accent: '#222222', text: '#222222', pattern: 'none', pc: '#dddddd', border: 'solid', hf: 'Playfair Display', bf: 'Work Sans' }
  ];
  var COLORS = { red: '#d62839', pink: '#f48fb1', blue: '#3a7bd5', navy: '#1f3a5f', green: '#2e8b57', teal: '#1f9d8f', gold: '#c9a25b', yellow: '#f6c445', orange: '#f28c28', purple: '#7b4fb5', violet: '#7b4fb5', black: '#1b1b1b', white: '#ffffff', gray: '#9aa3ad', grey: '#9aa3ad', brown: '#8a5a2b', maroon: '#7a1d2e', peach: '#ffcba4', mint: '#bfead9', lavender: '#d9c8f0', cream: '#fbf3e4', silver: '#c0c7cf', rose: '#e8788f' };
  var PATTERN_WORDS = { floral: 'florals', flowers: 'florals', flower: 'florals', roses: 'florals', dots: 'dots', polka: 'dots', stripes: 'stripes', striped: 'stripes', confetti: 'confetti', balloons: 'confetti', hearts: 'hearts', stars: 'stars', starry: 'stars', waves: 'waves', geometric: 'grid', grid: 'grid', sparkle: 'sparkles', glitter: 'sparkles', sparkles: 'sparkles' };
  var FALLBACKS = [['#fff1e6', '#ffd6e0', '#c2185b'], ['#e8f5e9', '#c8e6c9', '#2e7d32'], ['#e3f2fd', '#bbdefb', '#1565c0'], ['#fff8e1', '#ffe0b2', '#ef6c00'], ['#f3e5f5', '#e1bee7', '#6a1b9a']];

  function localSpec(prompt) {
    var p = String(prompt || '').toLowerCase();
    var words = p.split(/[^a-z0-9]+/).filter(Boolean);
    var th = null;
    THEMES.some(function (t) { return t.k.some(function (k) { if (p.indexOf(k) !== -1) { th = t; return true; } return false; }); });
    var h = hash(p || 'x');
    var spec;
    if (th) {
      spec = { name: 'Custom design', background: { type: 'gradient', colors: th.bg.slice(), angle: 135 }, pattern: { type: th.pattern, color: th.pc, opacity: 0.35, density: 5 },
               border: { style: th.border, color: th.accent, width: 3 }, text: { color: th.text, accent: th.accent, headingFont: th.hf, bodyFont: th.bf } };
    } else {
      var f = FALLBACKS[h % FALLBACKS.length];
      spec = { name: 'Custom design', background: { type: 'gradient', colors: [f[0], f[1]], angle: 135 }, pattern: { type: ['dots', 'stripes', 'waves', 'sparkles', 'none'][h % 5], color: f[2], opacity: 0.18, density: 5 },
               border: { style: 'solid', color: f[2], width: 3 }, text: { color: mix(f[2], '#000000', 0.45), accent: f[2], headingFont: 'Playfair Display', bodyFont: 'Poppins' } };
    }
    // colour words ("blue and gold") re-colour the design
    var found = [];
    words.forEach(function (w) { if (COLORS[w]) found.push(COLORS[w]); });
    if (found.length) {
      var lights = found.filter(function (c) { return lum(c) > 0.85; }), mains = found.filter(function (c) { return lum(c) <= 0.85; });
      if (lights.length && mains.length) {          // e.g. "gold and white": light background, coloured accents
        var acc = mains[0];
        spec.background.colors = [lights[0], mix(lights[0], acc, 0.14)];
        spec.text.color = mix(acc, '#000000', 0.6); spec.text.accent = mix(acc, '#000000', 0.15);
        spec.border.color = acc; spec.pattern.color = acc;
      } else {
        var c1 = found[0], c2 = found[1] || null, dark = lum(c1) < 0.55;
        spec.background.colors = dark ? [mix(c1, '#000000', 0.15), mix(c1, '#ffffff', 0.12)] : [mix(c1, '#ffffff', 0.55), mix(c1, '#ffffff', 0.15)];
        spec.text.color = dark ? '#ffffff' : mix(c1, '#000000', 0.65);
        spec.text.accent = (c2 && lum(c2) < 0.85) ? c2 : (dark ? '#f3d9a4' : mix(c1, '#000000', 0.25));
        spec.border.color = spec.text.accent; spec.pattern.color = (c2 && lum(c2) < 0.85) ? c2 : (dark ? mix(c1, '#ffffff', 0.4) : mix(c1, '#000000', 0.2));
      }
    }
    words.forEach(function (w) { if (PATTERN_WORDS[w]) { spec.pattern.type = PATTERN_WORDS[w]; spec.pattern.opacity = Math.max(spec.pattern.opacity, 0.3); } });
    if (/border|frame/.test(p) && spec.border.style === 'none') spec.border.style = 'solid';
    if (/no border/.test(p)) spec.border.style = 'none';
    if (/gold/.test(p)) { spec.border.color = '#c9a25b'; spec.text.accent = '#c9a25b'; }
    return spec;
  }

  // ---------- pattern + border painting ----------
  function flower(ctx, x, y, r, c, c2) {
    ctx.fillStyle = c;
    for (var i = 0; i < 6; i++) { ctx.save(); ctx.translate(x, y); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 0.32, r * 0.55, 0, 0, 6.2832); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, 6.2832); ctx.fill();
  }
  function heart(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y + s * 0.3); ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.5, y - s, x, y - s * 0.45); ctx.bezierCurveTo(x + s * 0.5, y - s, x + s, y - s * 0.4, x, y + s * 0.3); ctx.fill(); }
  function star(ctx, x, y, r, pts, inner) { ctx.beginPath(); for (var i = 0; i < pts * 2; i++) { var a = i * Math.PI / pts - Math.PI / 2, rr = i % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }

  function paintPattern(ctx, W, H, p, accent, rand) {
    if (!p || p.type === 'none') return;
    var d = p.density || 5, u = Math.min(W, H);
    ctx.save(); ctx.globalAlpha = p.opacity; ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
    var i, x, y, n;
    if (p.type === 'dots') { var gap = u / (4 + d * 1.6); ctx.globalAlpha = p.opacity * 0.8; for (y = gap / 2; y < H; y += gap) for (x = gap / 2 + ((Math.round(y / gap) % 2) ? gap / 2 : 0); x < W; x += gap) { ctx.beginPath(); ctx.arc(x, y, u * 0.007 + d * 0.0006 * u, 0, 6.2832); ctx.fill(); } }
    else if (p.type === 'stripes') { ctx.lineWidth = u * 0.012; var sg = u / (3 + d); for (x = -H; x < W + H; x += sg) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H * 0.6, H); ctx.stroke(); } }
    else if (p.type === 'grid') { ctx.lineWidth = Math.max(1, u * 0.002); var gg = u / (4 + d); for (x = gg; x < W; x += gg) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (y = gg; y < H; y += gg) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
    else if (p.type === 'waves') { ctx.lineWidth = u * 0.008; for (y = H * 0.55; y < H + u * 0.05; y += u * 0.045) { ctx.beginPath(); for (x = 0; x <= W; x += 6) { var yy = y + Math.sin(x / (u * 0.07) + y) * u * 0.014; x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke(); } }
    else if (p.type === 'confetti') { var cols = [p.color, accent, '#ffffff', mix(p.color, accent, 0.5)]; n = 40 + d * 14; ctx.globalAlpha = Math.min(0.9, p.opacity + 0.35); for (i = 0; i < n; i++) { ctx.fillStyle = cols[i % cols.length]; x = rand() * W; y = rand() * H; ctx.save(); ctx.translate(x, y); ctx.rotate(rand() * 6.28); if (i % 3) ctx.fillRect(-u * 0.012, -u * 0.006, u * 0.024, u * 0.012); else { ctx.beginPath(); ctx.arc(0, 0, u * 0.009, 0, 6.2832); ctx.fill(); } ctx.restore(); } }
    else if (p.type === 'florals') {
      n = 5 + d; var spots = [[0.06, 0.05], [0.94, 0.05], [0.06, 0.95], [0.94, 0.95], [0.5, 0.02], [0.5, 0.98]];
      for (i = 0; i < n; i++) { var s = i < spots.length ? spots[i] : [rand(), rand() < 0.5 ? rand() * 0.14 : 0.86 + rand() * 0.14]; flower(ctx, s[0] * W + (rand() - 0.5) * u * 0.05, s[1] * H + (rand() - 0.5) * u * 0.05, u * (0.035 + rand() * 0.05), p.color, accent); }
    }
    else if (p.type === 'hearts') { n = 14 + d * 3; for (i = 0; i < n; i++) { ctx.globalAlpha = p.opacity * (0.5 + rand() * 0.6); heart(ctx, rand() * W, rand() * H, u * (0.014 + rand() * 0.03)); } }
    else if (p.type === 'stars') { n = 18 + d * 4; for (i = 0; i < n; i++) { ctx.globalAlpha = p.opacity * (0.5 + rand() * 0.6); star(ctx, rand() * W, rand() * H, u * (0.01 + rand() * 0.022), 5, 0.45); } }
    else if (p.type === 'sparkles') { n = 22 + d * 4; for (i = 0; i < n; i++) { ctx.globalAlpha = p.opacity * (0.5 + rand() * 0.7); star(ctx, rand() * W, rand() * H, u * (0.008 + rand() * 0.02), 4, 0.25); } }
    ctx.restore();
  }

  function paintBorder(ctx, W, H, b) {
    if (!b || b.style === 'none') return;
    var u = Math.min(W, H), m = u * 0.045, w = Math.max(1, b.width * u / 500);
    ctx.save(); ctx.strokeStyle = b.color; ctx.lineWidth = w;
    if (b.style === 'dashed') ctx.setLineDash([w * 4, w * 3]);
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
    if (b.style === 'double' || b.style === 'ornate') { ctx.lineWidth = Math.max(1, w * 0.5); ctx.setLineDash([]); ctx.strokeRect(m * 1.6, m * 1.6, W - 3.2 * m, H - 3.2 * m); }
    if (b.style === 'ornate') { ctx.fillStyle = b.color; [[m, m], [W - m, m], [m, H - m], [W - m, H - m]].forEach(function (c) { ctx.beginPath(); ctx.arc(c[0], c[1], u * 0.014, 0, 6.2832); ctx.fill(); }); }
    ctx.restore();
  }

  function paintBackground(ctx, W, H, bg) {
    var c = bg.colors || ['#ffffff', '#f4f4f4'];
    if (bg.type === 'solid') { ctx.fillStyle = c[0]; ctx.fillRect(0, 0, W, H); return; }
    var a = (bg.angle || 135) * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), r = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
    var g = ctx.createLinearGradient(W / 2 - dx * r, H / 2 - dy * r, W / 2 + dx * r, H / 2 + dy * r);
    g.addColorStop(0, c[0]); g.addColorStop(1, c[1] || c[0]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ---------- customer text ----------
  function fmtValue(f, v) {
    try {
      if (f.type === 'date') return new Date(v + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      if (f.type === 'time') { var t = v.split(':'), h = parseInt(t[0], 10); return (h % 12 || 12) + ':' + t[1] + ' ' + (h >= 12 ? 'PM' : 'AM'); }
    } catch (e) {}
    return v;
  }

  function buildLines(fields, values, placeholders) {
    var lines = [];
    (fields || []).forEach(function (f, i) {
      var v = String((values || {})[f.key] || '').trim(), ph = false;
      if (!v) { if (!placeholders) return; v = f.label; ph = true; } else v = fmtValue(f, v);
      var role = i === 0 ? 'h' : f.type === 'textarea' ? 'p' : (f.type === 'date' || f.type === 'time') ? 's' : 't';
      var last = lines[lines.length - 1];
      if (role === 's' && last && last.role === 's' && !ph && !last.ph) { last.text += '   \u2022   ' + v; return; }   // date + time on one line
      lines.push({ text: v, role: role, ph: ph });
    });
    return lines;
  }

  function wrap(ctx, text, maxW) {
    var out = [], paras = String(text).split(/\n/);
    paras.forEach(function (para) {
      var words = para.split(/\s+/), line = '';
      words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; });
      out.push(line);
    });
    return out;
  }

  // draws the info lines centred inside region {x,y,w,h}
  function paintText(ctx, region, lines, spec, onImage) {
    if (!lines.length) return;
    var tx = (spec && spec.text) || { color: '#222222', accent: '#555555', headingFont: 'Playfair Display', bodyFont: 'Poppins' };
    var sizes = { h: 0.085, s: 0.036, t: 0.04, p: 0.032 }, scale = 1, blocks, total;
    function measure() {
      blocks = []; total = 0;
      lines.forEach(function (ln) {
        var fam = ln.role === 'h' ? tx.headingFont : tx.bodyFont, sz = region.h * sizes[ln.role] * scale * (ln.role === 'h' && SCRIPT_FONTS.indexOf(fam) !== -1 ? 1.3 : 1);
        ctx.font = (ln.role === 'p' ? 'italic ' : ln.role === 'h' ? '700 ' : '500 ') + sz + 'px "' + fam + '", serif';
        var parts = wrap(ctx, ln.text, region.w * 0.8), lh = sz * 1.3, gap = ln.role === 'h' ? sz * 0.55 : sz * 0.4;
        blocks.push({ ln: ln, sz: sz, fam: fam, parts: parts, lh: lh, gap: gap }); total += parts.length * lh + gap;
      });
    }
    measure();
    if (total > region.h * 0.86) { scale = region.h * 0.86 / total; measure(); }
    var y = region.y + (region.h - total) / 2, cx = region.x + region.w / 2;
    if (onImage) {   // keep the text readable on top of a photo/template
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.8)';
      var pw = region.w * 0.86, ph = total + region.h * 0.05, px = cx - pw / 2, py = y - region.h * 0.025, r = region.h * 0.02;
      ctx.beginPath(); ctx.moveTo(px + r, py); ctx.arcTo(px + pw, py, px + pw, py + ph, r); ctx.arcTo(px + pw, py + ph, px, py + ph, r); ctx.arcTo(px, py + ph, px, py, r); ctx.arcTo(px, py, px + pw, py, r); ctx.fill(); ctx.restore();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    blocks.forEach(function (b) {
      ctx.font = (b.ln.role === 'p' ? 'italic ' : b.ln.role === 'h' ? '700 ' : '500 ') + b.sz + 'px "' + b.fam + '", serif';
      ctx.fillStyle = onImage ? '#2b2b2b' : (b.ln.role === 'h' || b.ln.role === 's' ? tx.accent : tx.color);
      if (onImage && b.ln.role === 'h') ctx.fillStyle = '#111111';
      ctx.globalAlpha = b.ln.ph ? 0.45 : 1;
      b.parts.forEach(function (part) { ctx.fillText(part, cx, y); y += b.lh; });
      y += b.gap; ctx.globalAlpha = 1;
    });
  }

  function drawImageCover(ctx, img, x, y, w, h) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore();
  }

  // ---------- the back of each kind of product ----------
  function paintBack(ctx, W, H, product, rand) {
    var u = Math.min(W, H), i;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (product === 'magnet') {          // flexible magnet sheet: dark grey, slightly rough
      ctx.fillStyle = '#2e2e31'; ctx.fillRect(0, 0, W, H);
      for (i = 0; i < 2600; i++) { ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.12)'; ctx.fillRect(rand() * W, rand() * H, 2 + rand() * 3, 2 + rand() * 3); }
      var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#8b8b92'; ctx.font = '600 ' + u * 0.045 + 'px "Poppins", sans-serif'; ctx.fillText("HAPPY QUEEN'S", W / 2, H * 0.47);
      ctx.font = '500 ' + u * 0.032 + 'px "Poppins", sans-serif'; ctx.fillText('FLEXIBLE MAGNET', W / 2, H * 0.55);
    } else if (product === 'keychain') {  // acrylic, white backing
      var kg = ctx.createLinearGradient(0, 0, W, H); kg.addColorStop(0, '#fbfdfd'); kg.addColorStop(1, '#e9f0f3');
      ctx.fillStyle = kg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#9fb3ba'; ctx.font = '600 ' + u * 0.05 + 'px "Poppins", sans-serif'; ctx.fillText("Happy Queen's", W / 2, H * 0.5);
      ctx.font = '500 ' + u * 0.03 + 'px "Poppins", sans-serif'; ctx.fillText('CRAFTY HOUSE', W / 2, H * 0.57);
    } else if (product === 'sticker') {   // vinyl sticker: paper liner
      ctx.fillStyle = '#f3efe6'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(120,140,150,0.18)'; ctx.lineWidth = Math.max(1, u * 0.004);
      for (i = -H; i < W + H; i += u * 0.08) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }
      ctx.fillStyle = 'rgba(100,120,130,0.55)'; ctx.font = '600 ' + u * 0.045 + 'px "Poppins", sans-serif'; ctx.fillText("Happy Queen's Crafty House", W / 2, H * 0.5);
    } else if (product === 'photo') {     // photo paper: white with a faint watermark
      ctx.fillStyle = '#fbfbfa'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.5); ctx.fillStyle = 'rgba(140,165,172,0.22)'; ctx.font = '600 ' + u * 0.05 + 'px "Poppins", sans-serif';
      for (i = -4; i <= 4; i++) ctx.fillText("HAPPY QUEEN'S CRAFTY HOUSE", 0, i * u * 0.12);
      ctx.restore();
      ctx.fillStyle = '#9aaab0'; ctx.font = '500 ' + u * 0.03 + 'px "Poppins", sans-serif'; ctx.fillText('PHOTO PAPER', W / 2, H * 0.95);
    } else {                              // paper card
      ctx.fillStyle = '#fffdf8'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#9aa7ab'; ctx.font = '500 ' + H * 0.025 + 'px "Poppins", sans-serif'; ctx.fillText("Happy Queen's Crafty House", W / 2, H * 0.94);
    }
  }

  // where the keyring hole is, as a fraction of the picture (the 3D viewer hangs the ring + chain there)
  function holePos(shape, W, H) {
    var u = Math.min(W, H);
    if (shape === 'photo') return { fx: 0.5, fy: (u * 0.07 + u * 0.045) / H };
    return { fx: 0.5, fy: shape === 'triangle' ? 0.22 : 0.12 };
  }

  // ---------- main entry ----------
  // o: { w, h, spec, image, mode: 'cover'|'inside-left'|'inside-right'|'back', fields, values, textPosition, placeholders, seed, cut }
  function drawFlat(canvas, o) {
    var W = canvas.width = o.w, H = canvas.height = o.h, ctx = canvas.getContext('2d');
    var mode = o.mode || 'cover', spec = o.spec, seed = hash(JSON.stringify(spec || {}) + (o.seed || ''));
    var paper = '#fffdf8';

    if (mode === 'back') { paintBack(ctx, W, H, o.product || 'paper', rng(hash('back' + (o.product || 'paper')))); return canvas; }
    if (mode === 'inside-left' || mode === 'inside-right') {
      ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
      if (spec) { paintPattern(ctx, W, H, { type: spec.pattern.type, color: spec.pattern.color, opacity: spec.pattern.opacity * 0.35, density: spec.pattern.density }, spec.text.accent, rng(seed)); paintBorder(ctx, W, H, { style: spec.border.style === 'none' ? 'none' : 'solid', color: spec.border.color, width: 2 }); }
      if (mode === 'inside-right') {
        var lines = buildLines(o.fields, o.values, o.placeholders).filter(function (l) { return l.role !== 'h' || true; });
        paintText(ctx, { x: 0, y: 0, w: W, h: H }, lines, { text: { color: '#3b3b3b', accent: spec ? spec.text.accent : '#8a6d3b', headingFont: spec ? spec.text.headingFont : 'Playfair Display', bodyFont: spec ? spec.text.bodyFont : 'Poppins' } }, false);
      }
      return canvas;
    }

    // ----- cover / single-sided design -----
    var bottom = o.textPosition === 'bottom';
    var stripH = bottom ? H * 0.16 : 0, area = { x: 0, y: 0, w: W, h: H - stripH };
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

    var hasImage = !!o.image, onImage = hasImage;
    if (hasImage) {
      drawImageCover(ctx, o.image, area.x, area.y, area.w, area.h);
    } else if (spec) {
      ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
      paintBackground(ctx, W, area.h, spec.background);
      paintPattern(ctx, W, area.h, spec.pattern, spec.text.accent, rng(seed));
      paintBorder(ctx, W, area.h, spec.border);
      ctx.restore();
    } else {
      ctx.fillStyle = '#eef3f5'; ctx.fillRect(area.x, area.y, area.w, area.h);
      if (o.placeholders) { ctx.fillStyle = '#9fb4bb'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '500 ' + Math.min(W, H) * 0.045 + 'px "Poppins", sans-serif'; ctx.fillText('Your design will appear here', W / 2, area.h / 2); }
    }

    var lines = buildLines(o.fields, o.values, o.placeholders && !hasImage);
    if (bottom) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, H - stripH, W, stripH);
      var capSpec = { text: { color: '#222222', accent: '#222222', headingFont: 'Poppins', bodyFont: 'Poppins' } };
      lines.forEach(function (l) { l.role = 't'; });
      paintText(ctx, { x: 0, y: H - stripH, w: W, h: stripH }, lines.slice(0, 1), capSpec, false);
    } else {
      paintText(ctx, area, lines, spec || { text: { color: '#222', accent: '#555', headingFont: 'Playfair Display', bodyFont: 'Poppins' } }, onImage);
    }
    return canvas;
  }

  // ---------- cut shapes (keychains, magnets) ----------
  function tracePath(ctx, W, H, shape) {
    var u = Math.min(W, H), m = u * 0.04, x = m, y = m, w = W - 2 * m, h = H - 2 * m;
    ctx.beginPath();
    if (shape === 'circle') { ctx.arc(W / 2, H / 2, u / 2 - m, 0, 6.2832); }
    else if (shape === 'triangle') { ctx.moveTo(W / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
    else if (shape === 'heart') {
      ctx.moveTo(x + w / 2, y + h * 0.95);
      ctx.bezierCurveTo(x - w * 0.1, y + h * 0.55, x + w * 0.02, y + h * 0.02, x + w / 2, y + h * 0.28);
      ctx.bezierCurveTo(x + w * 0.98, y + h * 0.02, x + w * 1.1, y + h * 0.55, x + w / 2, y + h * 0.95);
    } else { var r = u * 0.07; ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); }
    ctx.closePath();
  }

  function ring(ctx, cx, cy, r, u) {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill(); ctx.restore();
    ctx.save(); ctx.strokeStyle = '#aab4ba'; ctx.lineWidth = u * 0.008; ctx.beginPath(); ctx.arc(cx, cy, r + u * 0.004, 0, 6.2832); ctx.stroke(); ctx.restore();
  }

  // a photo whose background was removed, with a white sticker-style outline
  function drawCutout(ctx, W, H, sub, hole) {
    var u = Math.min(W, H), pad = u * 0.07, topSpace = hole ? u * 0.08 : 0;
    var aw = W - 2 * pad, ah = H - 2 * pad - topSpace, k = Math.min(aw / sub.width, ah / sub.height);
    var dw = sub.width * k, dh = sub.height * k, dx = (W - dw) / 2, dy = pad + topSpace + (ah - dh) / 2;
    var sil = document.createElement('canvas'); sil.width = W; sil.height = H;
    var sx = sil.getContext('2d'), r = u * 0.022, a;
    for (a = 0; a < 24; a++) { var ang = a / 24 * 6.2832; sx.drawImage(sub, dx + Math.cos(ang) * r, dy + Math.sin(ang) * r, dw, dh); }
    var tabY = pad + u * 0.045;
    if (hole) { sx.beginPath(); sx.arc(W / 2, tabY, u * 0.055, 0, 6.2832); sx.fill(); }
    sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#ffffff'; sx.fillRect(0, 0, W, H);
    ctx.drawImage(sil, 0, 0); ctx.drawImage(sub, dx, dy, dw, dh);
    if (hole) ring(ctx, W / 2, tabY, u * 0.025, u);
  }

  function draw(canvas, o) {
    var cut = o.cut;
    if (!cut || !cut.shape || (o.mode && o.mode !== 'cover')) return drawFlat(canvas, o);
    var W = canvas.width = o.w, H = canvas.height = o.h, ctx = canvas.getContext('2d'), u = Math.min(W, H);
    ctx.clearRect(0, 0, W, H);
    if (cut.shape === 'photo') {
      if (!cut.subject) {
        ctx.save(); ctx.setLineDash([u * 0.02, u * 0.015]); ctx.strokeStyle = 'rgba(30,87,97,0.55)'; ctx.lineWidth = u * 0.006;
        ctx.strokeRect(u * 0.06, u * 0.06, W - u * 0.12, H - u * 0.12); ctx.restore();
        ctx.fillStyle = 'rgba(30,87,97,0.75)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 ' + u * 0.05 + 'px "Poppins", sans-serif';
        ctx.fillText('Upload your photo', W / 2, H / 2);
        return canvas;
      }
      drawCutout(ctx, W, H, cut.subject, cut.hole);
      return canvas;
    }
    var tmp = document.createElement('canvas');
    drawFlat(tmp, Object.assign({}, o, { textPosition: 'center', mode: 'cover' }));
    ctx.save(); tracePath(ctx, W, H, cut.shape); ctx.clip(); ctx.drawImage(tmp, 0, 0); ctx.restore();
    ctx.save(); tracePath(ctx, W, H, cut.shape); ctx.lineWidth = u * 0.012; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke(); ctx.restore();
    if (cut.hole) { var hp = holePos(cut.shape, W, H); ring(ctx, W * hp.fx, H * hp.fy, u * 0.032, u); }
    return canvas;
  }

  // ---------- background remover (built in, no internet needed) ----------
  // Works best on a plain background: it clears everything that touches the edge and looks like the edge colour.
  // tol 0 = keep the image as it is (use when the picture already has a transparent background).
  function cropToContent(c) {
    var x = c.getContext('2d'), w = c.width, h = c.height, px = x.getImageData(0, 0, w, h).data, minX = w, minY = h, maxX = -1, maxY = -1, i, j;
    for (j = 0; j < h; j++) for (i = 0; i < w; i++) if (px[(j * w + i) * 4 + 3] > 12) { if (i < minX) minX = i; if (i > maxX) maxX = i; if (j < minY) minY = j; if (j > maxY) maxY = j; }
    if (maxX < 0) return c;
    var out = document.createElement('canvas'); out.width = maxX - minX + 1; out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  function removeBackground(img, tol, maxSide) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var k = Math.min(1, (maxSide || 1000) / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
    var d = x.getImageData(0, 0, w, h), px = d.data, i, transparent = 0;
    for (i = 3; i < px.length; i += 4) if (px[i] < 250) transparent++;
    if (!tol || transparent > w * h * 0.02) return cropToContent(c);          // already has a transparent background

    function median(a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
    var R = [], G = [], B = [], p;
    function sample(pp) { R.push(px[pp * 4]); G.push(px[pp * 4 + 1]); B.push(px[pp * 4 + 2]); }
    for (i = 0; i < w; i++) { sample(i); sample((h - 1) * w + i); }
    for (i = 0; i < h; i++) { sample(i * w); sample(i * w + w - 1); }
    var bg = [median(R), median(G), median(B)], t2 = tol * tol;
    var removed = new Uint8Array(w * h), q = new Int32Array(w * h), qh = 0, qt = 0;
    function near(pp) { var o = pp * 4, dr = px[o] - bg[0], dg = px[o + 1] - bg[1], db = px[o + 2] - bg[2]; return dr * dr + dg * dg + db * db <= t2; }
    function push(pp) { if (!removed[pp] && near(pp)) { removed[pp] = 1; q[qt++] = pp; } }
    for (i = 0; i < w; i++) { push(i); push((h - 1) * w + i); }
    for (i = 0; i < h; i++) { push(i * w); push(i * w + w - 1); }
    while (qh < qt) {
      p = q[qh++]; var cx = p % w, cy = (p / w) | 0;
      if (cx > 0) push(p - 1); if (cx < w - 1) push(p + 1); if (cy > 0) push(p - w); if (cy < h - 1) push(p + w);
    }
    for (p = 0; p < w * h; p++) {
      if (removed[p]) { px[p * 4 + 3] = 0; continue; }
      var cx2 = p % w, cy2 = (p / w) | 0;   // soften the edge by one pixel
      if ((cx2 > 0 && removed[p - 1]) || (cx2 < w - 1 && removed[p + 1]) || (cy2 > 0 && removed[p - w]) || (cy2 < h - 1 && removed[p + w])) px[p * 4 + 3] = 150;
    }
    x.putImageData(d, 0, 0);
    return cropToContent(c);
  }

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(FONTS.map(function (f) { return document.fonts.load('600 32px "' + f + '"').catch(function () {}); })).then(function () {});
  }

  window.HQDesign = { FONTS: FONTS, localSpec: localSpec, draw: draw, loadFonts: loadFonts, removeBackground: removeBackground, holePos: holePos };
})();
