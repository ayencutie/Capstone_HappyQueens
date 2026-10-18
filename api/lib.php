<?php
// Shared helpers for admin.php and shop.php

function default_occasions() {
    return ['Wedding', 'Birthday', 'Debut', 'Christening', 'Anniversary', 'Corporate', 'Other'];
}

function json_list($text) {
    $d = json_decode((string)$text, true);
    return is_array($d) ? $d : [];
}

function service_out(array $r, $withChoices = false) {
    $o = [
        'id'            => (int)$r['id'],
        'name'          => $r['name'],
        'description'   => $r['description'],
        'priceText'     => $r['price_text'],
        'image'         => $r['image_path'],
        'orderUrl'      => $r['order_url'],
        'needsTemplate' => (bool)$r['needs_template'],
        'isActive'      => (bool)$r['is_active'],
        'occasions'     => json_list($r['occasions']) ?: default_occasions(),
        'previewMode'   => $r['preview_mode'] === '3d' ? '3d' : 'flat',
        'shapes'        => json_list($r['shapes']) ?: ['no-fold'],
        'ratioW'        => (float)$r['ratio_w'],
        'ratioH'        => (float)$r['ratio_h'],
        'textPosition'  => $r['text_position'] === 'bottom' ? 'bottom' : 'center',
        'aiEnabled'     => (bool)$r['ai_enabled'],
        'uploadEnabled' => (bool)$r['upload_enabled'],
        'infoFields'    => json_list($r['info_fields']),
        'needsInfo'     => isset($r['needs_info']) ? (bool)$r['needs_info'] : true,
        'cutShapes'     => clean_cut_shapes(json_list($r['cut_shapes'] ?? '[]')),
        'cutHole'       => !empty($r['cut_hole']),
        'productType'   => in_array($r['product_type'] ?? '', ['paper', 'photo', 'sticker', 'magnet', 'keychain'], true) ? $r['product_type'] : 'paper',
        'templateCount' => isset($r['template_count']) ? (int)$r['template_count'] : 0,
    ];
    if ($withChoices) $o['choices'] = json_list($r['choices']);
    return $o;
}

function clean_text($v, $max) { return mb_substr(trim((string)$v), 0, $max); }

function clean_choices($c) {
    $out = [];
    if (!is_array($c)) return $out;
    foreach (array_slice($c, 0, 20) as $g) {
        if (!is_array($g)) continue;
        $opts = [];
        foreach (array_slice(is_array($g['options'] ?? null) ? $g['options'] : [], 0, 50) as $o) {
            $n = clean_text($o['name'] ?? '', 60);
            if ($n === '') continue;
            $opts[] = ['name' => $n, 'price' => max(0, round((float)($o['price'] ?? 0), 2))];
        }
        $name = clean_text($g['name'] ?? '', 60);
        $out[] = ['name' => $name !== '' ? $name : 'Untitled', 'required' => !empty($g['required']), 'options' => $opts];
    }
    return $out;
}

function clean_occasions($list) {
    $out = [];
    if (!is_array($list)) return $out;
    foreach (array_slice($list, 0, 30) as $o) {
        $n = clean_text($o, 40);
        if ($n !== '' && !in_array($n, $out, true)) $out[] = $n;
    }
    return $out;
}

// Saves one uploaded file under uploads/<subdir>/ . Returns [path, originalName, mime, size].
function save_upload(array $file, $subdir, array $allowedExt, $maxBytes) {
    static $mimes = [
        'png' => ['image/png'], 'jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'],
        'pdf' => ['application/pdf'],
        'svg' => ['image/svg+xml', 'text/xml', 'application/xml', 'text/plain'],
    ];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $e = $file['error'] ?? 0;
        throw new RuntimeException(($e === UPLOAD_ERR_INI_SIZE || $e === UPLOAD_ERR_FORM_SIZE) ? 'File is too big for the server (see upload_max_filesize in php.ini).' : 'Upload failed.');
    }
    if ($file['size'] > $maxBytes) throw new RuntimeException(basename($file['name']) . ' is larger than ' . round($maxBytes / 1048576) . ' MB.');
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowedExt, true)) throw new RuntimeException(basename($file['name']) . ': file type not allowed.');
    if (function_exists('finfo_open')) {
        $mime = finfo_file(finfo_open(FILEINFO_MIME_TYPE), $file['tmp_name']);
        if (!in_array($mime, $mimes[$ext], true)) throw new RuntimeException(basename($file['name']) . ": the file content doesn't match its type.");
    } else {
        $mime = $mimes[$ext][0];
    }
    $dir = __DIR__ . '/../uploads/' . $subdir;
    if (!is_dir($dir) && !mkdir($dir, 0775, true)) throw new RuntimeException('Cannot create the uploads folder.');
    $name = bin2hex(random_bytes(10)) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $name)) throw new RuntimeException('Could not save the file (is the uploads folder writable?).');
    return ['uploads/' . $subdir . '/' . $name, mb_substr(basename($file['name']), 0, 190), $mime, (int)$file['size']];
}

// Deletes a file only if it lives inside /uploads
function delete_file($rel) {
    if (!$rel || preg_match('#^https?://#i', $rel)) return;
    $root = realpath(__DIR__ . '/../uploads');
    $p = realpath(__DIR__ . '/../' . $rel);
    if ($root && $p && strpos($p, $root) === 0 && is_file($p)) @unlink($p);
}

function safe_url($u) {
    $u = trim((string)$u);
    if ($u === '') return '';
    if (preg_match('/^\s*(javascript|data|vbscript):/i', $u)) return '';
    return mb_substr($u, 0, 190);
}


const SPEC_FONTS = ['Playfair Display', 'Great Vibes', 'Dancing Script', 'Poppins', 'Baloo 2', 'Work Sans'];

function clean_shapes($l) {
    $out = [];
    foreach ((array)$l as $x) if (in_array($x, ['no-fold', 'two-fold'], true) && !in_array($x, $out, true)) $out[] = $x;
    return $out ?: ['no-fold'];
}

function clean_ratio($v, $def) {
    $v = (float)$v;
    return ($v >= 0.5 && $v <= 60) ? round($v, 2) : $def;
}

// What customers must type in before ordering (name, address, date ...)
function clean_info_fields($l) {
    $out = []; $keys = [];
    foreach (array_slice(is_array($l) ? $l : [], 0, 15) as $f) {
        if (!is_array($f)) continue;
        $label = clean_text($f['label'] ?? '', 60);
        if ($label === '') continue;
        $type = in_array($f['type'] ?? '', ['text', 'textarea', 'date', 'time'], true) ? $f['type'] : 'text';
        $key = trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($label)), '_') ?: 'field';
        $base = $key; $i = 2;
        while (in_array($key, $keys, true)) $key = $base . '_' . $i++;
        $keys[] = $key;
        $out[] = ['key' => $key, 'label' => $label, 'type' => $type, 'required' => !empty($f['required'])];
    }
    return $out;
}

function clamp_num($v, $min, $max, $def) { $v = is_numeric($v) ? (float)$v : $def; return max($min, min($max, $v)); }
function clean_color($c, $def) { return (is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c)) ? strtolower($c) : $def; }
function pick($v, array $allowed, $def) { return in_array($v, $allowed, true) ? $v : $def; }

// Makes sure a design "spec" (from the browser or from the AI) can only contain safe, known values.
function clean_spec($s) {
    if (!is_array($s)) return null;
    $bg = is_array($s['background'] ?? null) ? $s['background'] : [];
    $pt = is_array($s['pattern'] ?? null) ? $s['pattern'] : [];
    $bd = is_array($s['border'] ?? null) ? $s['border'] : [];
    $tx = is_array($s['text'] ?? null) ? $s['text'] : [];
    $colors = is_array($bg['colors'] ?? null) ? array_values($bg['colors']) : [];
    return [
        'name' => clean_text($s['name'] ?? 'Custom design', 60),
        'background' => [
            'type' => pick($bg['type'] ?? '', ['gradient', 'solid'], 'gradient'),
            'colors' => [clean_color($colors[0] ?? '', '#fdf8f0'), clean_color($colors[1] ?? '', '#f6e9d7')],
            'angle' => (int)clamp_num($bg['angle'] ?? 135, 0, 360, 135),
        ],
        'pattern' => [
            'type' => pick($pt['type'] ?? '', ['none', 'dots', 'stripes', 'confetti', 'florals', 'hearts', 'stars', 'waves', 'grid', 'sparkles'], 'none'),
            'color' => clean_color($pt['color'] ?? '', '#d9bd8a'),
            'opacity' => clamp_num($pt['opacity'] ?? 0.3, 0, 0.7, 0.3),
            'density' => (int)clamp_num($pt['density'] ?? 5, 1, 10, 5),
        ],
        'border' => [
            'style' => pick($bd['style'] ?? '', ['none', 'solid', 'double', 'dashed', 'ornate'], 'none'),
            'color' => clean_color($bd['color'] ?? '', '#b8914a'),
            'width' => (int)clamp_num($bd['width'] ?? 3, 1, 12, 3),
        ],
        'text' => [
            'color' => clean_color($tx['color'] ?? '', '#3b2a1a'),
            'accent' => clean_color($tx['accent'] ?? '', '#b8914a'),
            'headingFont' => pick($tx['headingFont'] ?? '', SPEC_FONTS, 'Playfair Display'),
            'bodyFont' => pick($tx['bodyFont'] ?? '', SPEC_FONTS, 'Poppins'),
        ],
    ];
}


// Shapes a keychain / magnet can be cut into. "photo" = follow the customer's photo (background removed).
function clean_cut_shapes($l) {
    $out = [];
    foreach ((array)$l as $x) if (in_array($x, ['circle', 'triangle', 'square', 'heart', 'photo'], true) && !in_array($x, $out, true)) $out[] = $x;
    return $out;
}


// ---- rembg (Python) background remover ----
function rembg_ready() {
    if (!is_file(REMBG_PYTHON) || !is_file(REMBG_SCRIPT) || !function_exists('exec')) return false;
    $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
    return !in_array('exec', $disabled, true);
}

// returns [exitCode, output text]
function rembg_run($in, $out) {
    $models = __DIR__ . '/../tools/models';
    if (!is_dir($models)) @mkdir($models, 0775, true);
    putenv('U2NET_HOME=' . $models);          // where the model is stored (Apache's own user folder may not be writable)
    @set_time_limit(240);
    $cmd = escapeshellarg(REMBG_PYTHON) . ' ' . escapeshellarg(REMBG_SCRIPT) . ' ' . escapeshellarg($in) . ' ' . escapeshellarg($out) . ' 2>&1';
    $lines = [];
    exec($cmd, $lines, $code);
    return [$code, implode("\n", $lines)];
}
