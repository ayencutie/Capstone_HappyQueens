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
        'uploadKind'    => pick($r['upload_kind'] ?? '', ['design', 'photos', 'document'], 'design'),
        'aiMode'        => pick($r['ai_mode'] ?? '', ['design', 'edit'], 'design'),
        'frameStyle'    => pick($r['frame_style'] ?? '', ['', 'instax', 'strip'], ''),
        'doubleSided'   => !empty($r['double_sided']),
        'unitLabel'     => ($r['unit_label'] ?? '') !== '' ? $r['unit_label'] : 'pc',
        'fromPrice'     => from_price($r),
        'productType'   => in_array($r['product_type'] ?? '', ['paper', 'photo', 'sticker', 'magnet', 'keychain'], true) ? $r['product_type'] : 'paper',
        'templateCount' => isset($r['template_count']) ? (int)$r['template_count'] : 0,
    ];
    if ($withChoices) {
        $o['choices'] = json_list($r['choices']);
        $pm = json_list($r['price_matrix'] ?? '[]');
        $o['priceMatrix'] = ['groups' => $pm['groups'] ?? [], 'prices' => !empty($pm['prices']) ? $pm['prices'] : new stdClass()];
    }
    return $o;
}

function clean_text($v, $max) { return mb_substr(trim((string)$v), 0, $max); }

function clean_id($v, array &$used) {
    $v = is_string($v) ? strtolower($v) : '';
    if (!preg_match('/^[a-z0-9_]{2,16}$/', $v) || isset($used[$v])) { do { $v = substr(bin2hex(random_bytes(6)), 0, 10); } while (isset($used[$v])); }
    $used[$v] = true;
    return $v;
}

function clean_choices($c) {
    $out = []; $used = [];
    if (!is_array($c)) return $out;
    foreach (array_slice($c, 0, 20) as $g) {
        if (!is_array($g)) continue;
        $gid = clean_id($g['id'] ?? '', $used);
        $opts = [];
        foreach (array_slice(is_array($g['options'] ?? null) ? $g['options'] : [], 0, 50) as $o) {
            $n = clean_text($o['name'] ?? '', 60);
            if ($n === '') continue;
            $opts[] = ['id' => clean_id($o['id'] ?? '', $used), 'name' => $n, 'price' => max(0, round((float)($o['price'] ?? 0), 2)),
                       'w' => clamp_num($o['w'] ?? 0, 0, 5000, 0), 'h' => clamp_num($o['h'] ?? 0, 0, 5000, 0),   // real size (for the preview)
                       'mono' => !empty($o['mono']), 'note' => clean_text($o['note'] ?? '', 100)];
        }
        $name = clean_text($g['name'] ?? '', 60);
        $out[] = ['id' => $gid, 'name' => $name !== '' ? $name : 'Untitled', 'required' => !empty($g['required']),
                  'role' => pick($g['role'] ?? '', ['', 'size', 'color'], ''), 'unit' => pick($g['unit'] ?? 'mm', ['mm', 'cm', 'in'], 'mm'), 'options' => $opts];
    }
    return $out;
}

// "Price table": one price for each combination of the chosen groups (e.g. paper size x print color)
function clean_price_matrix($m, array $choices) {
    $out = ['groups' => [], 'prices' => []];
    if (!is_array($m)) return $out;
    $byId = [];
    foreach ($choices as $g) $byId[$g['id']] = $g;
    foreach (array_slice((array)($m['groups'] ?? []), 0, 3) as $gid) {
        if (isset($byId[$gid]) && count($byId[$gid]['options']) && !in_array($gid, $out['groups'], true)) $out['groups'][] = $gid;
    }
    if (!$out['groups']) return $out;
    $combos = [[]];
    foreach ($out['groups'] as $gid) {
        $next = [];
        foreach ($combos as $c) foreach ($byId[$gid]['options'] as $o) { $next[] = array_merge($c, [$o['id']]); if (count($next) >= 500) break 2; }
        $combos = $next;
    }
    $valid = [];
    foreach ($combos as $c) $valid[implode('|', $c)] = true;
    foreach ((array)($m['prices'] ?? []) as $k => $v) {
        if (isset($valid[$k]) && is_numeric($v) && $v > 0 && $v <= 100000) $out['prices'][$k] = round((float)$v, 2);
    }
    return $out;
}

function from_price(array $r) {
    $m = json_list($r['price_matrix'] ?? '[]');
    if (!empty($m['groups']) && !empty($m['prices'])) return min(array_map('floatval', $m['prices']));
    return preg_match('/\d+(\.\d+)?/', (string)$r['price_text'], $x) ? (float)$x[0] : null;
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
        'doc' => ['application/msword', 'application/x-ole-storage', 'application/CDFV2', 'application/octet-stream'],
        'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
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
// fonts a customer can choose for their own text (the AI still uses SPEC_FONTS)
const CUSTOM_FONTS = ['Playfair Display', 'Great Vibes', 'Dancing Script', 'Poppins', 'Baloo 2', 'Work Sans', 'Montserrat', 'Lora', 'Cinzel', 'Pacifico', 'Satisfy', 'Cormorant Garamond', 'Oswald', 'Raleway', 'Caveat', 'Parisienne', 'Allura', 'Abril Fatface'];

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
        $out[] = ['key' => $key, 'label' => $label, 'type' => $type, 'required' => !empty($f['required']), 'place' => pick($f['place'] ?? 'front', ['front', 'inside', 'back'], 'front')];   // place = where the text is printed
    }
    return $out;
}

function clamp_num($v, $min, $max, $def) { $v = is_numeric($v) ? (float)$v : $def; return max($min, min($max, $v)); }
function clean_color($c, $def) { return (is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/', $c)) ? strtolower($c) : $def; }
function pick($v, array $allowed, $def) { return in_array($v, $allowed, true) ? $v : $def; }

// Makes sure a design "spec" (from the browser or from the AI) can only contain safe, known values.
function clean_bg($bg, $c1, $c2, $angle) {
    $bg = is_array($bg) ? $bg : [];
    $colors = is_array($bg['colors'] ?? null) ? array_values($bg['colors']) : [];
    return ['type' => pick($bg['type'] ?? '', ['gradient', 'solid'], 'gradient'),
            'colors' => [clean_color($colors[0] ?? '', $c1), clean_color($colors[1] ?? '', $c2)],
            'angle' => (int)clamp_num($bg['angle'] ?? $angle, 0, 360, $angle)];
}
function clean_pattern($pt, $color, $opacity, $density) {
    $pt = is_array($pt) ? $pt : [];
    return ['type' => pick($pt['type'] ?? '', ['none', 'dots', 'stripes', 'confetti', 'florals', 'hearts', 'stars', 'waves', 'grid', 'sparkles'], 'none'),
            'color' => clean_color($pt['color'] ?? '', $color), 'opacity' => clamp_num($pt['opacity'] ?? $opacity, 0, 0.7, $opacity),
            'density' => (int)clamp_num($pt['density'] ?? $density, 1, 10, $density)];
}
function clean_border($bd, $color) {
    $bd = is_array($bd) ? $bd : [];
    return ['style' => pick($bd['style'] ?? '', ['none', 'solid', 'double', 'dashed', 'ornate'], 'none'),
            'color' => clean_color($bd['color'] ?? '', $color), 'width' => (int)clamp_num($bd['width'] ?? 3, 1, 12, 3)];
}

// A design = the FRONT (background, pattern, border, text style) + the BACK (+ a note for the inside of a folded card).
function clean_spec($s) {
    if (!is_array($s)) return null;
    $bg = clean_bg($s['background'] ?? null, '#fdf8f0', '#f6e9d7', 135);
    $pt = clean_pattern($s['pattern'] ?? null, '#d9bd8a', 0.3, 5);
    $bd = clean_border($s['border'] ?? null, '#b8914a');
    $tx = is_array($s['text'] ?? null) ? $s['text'] : [];
    $text = ['color' => clean_color($tx['color'] ?? '', '#3b2a1a'), 'accent' => clean_color($tx['accent'] ?? '', '#b8914a'),
             'headingFont' => pick($tx['headingFont'] ?? '', SPEC_FONTS, 'Playfair Display'), 'bodyFont' => pick($tx['bodyFont'] ?? '', SPEC_FONTS, 'Poppins')];
    $bk = is_array($s['back'] ?? null) ? $s['back'] : null;
    if ($bk) {
        $btx = is_array($bk['text'] ?? null) ? $bk['text'] : [];
        $back = ['background' => clean_bg($bk['background'] ?? null, $bg['colors'][1], $bg['colors'][0], 315),
                 'pattern' => clean_pattern($bk['pattern'] ?? null, $pt['color'], $pt['opacity'], $pt['density']),
                 'border' => clean_border($bk['border'] ?? null, $bd['color']),
                 'text' => ['color' => clean_color($btx['color'] ?? '', $text['color']), 'accent' => clean_color($btx['accent'] ?? '', $text['accent'])], 'lines' => []];
        foreach (array_slice((array)($bk['lines'] ?? []), 0, 2) as $l) { $l = clean_text($l, 70); if ($l !== '') $back['lines'][] = $l; }
    } else {
        $back = ['background' => ['type' => 'gradient', 'colors' => [$bg['colors'][1], $bg['colors'][0]], 'angle' => 315], 'pattern' => $pt, 'border' => $bd,
                 'text' => ['color' => $text['color'], 'accent' => $text['accent']], 'lines' => []];
    }
    if (!$back['lines']) $back['lines'] = ['Thank you'];
    return ['name' => clean_text($s['name'] ?? 'Custom design', 60), 'background' => $bg, 'pattern' => $pt, 'border' => $bd, 'text' => $text,
            'back' => $back, 'insideNote' => clean_text($s['insideNote'] ?? '', 90)];
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


// ---- saving the customer's design pictures (PNG from the browser) ----
function save_png_data($dataUrl, $rel) {
    if (strpos($dataUrl, 'data:image/png;base64,') !== 0) return false;
    $bin = base64_decode(substr($dataUrl, 22), true);
    if ($bin === false || strlen($bin) > 6 * 1048576 || substr($bin, 0, 8) !== "\x89PNG\r\n\x1a\n" || !@getimagesizefromstring($bin)) return false;
    $dir = __DIR__ . '/../uploads/designs';
    if (!is_dir($dir) && !mkdir($dir, 0775, true)) return false;
    return file_put_contents(__DIR__ . '/../' . $rel, $bin) !== false;
}

// ---- AI design suggestion (Anthropic or OpenAI key) ----
function http_json($url, array $headers, array $body, $timeout = 60) {
    if (!function_exists('curl_init')) throw new RuntimeException('PHP curl is disabled.', 500);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers), CURLOPT_POSTFIELDS => json_encode($body)]);
    if (function_exists('ca_bundle') && ($ca = ca_bundle())) curl_setopt($ch, CURLOPT_CAINFO, $ca);
    $res = curl_exec($ch); $http = curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) throw new RuntimeException('Could not reach the AI service: ' . $err, 502);
    return [$http, json_decode((string)$res, true)];
}

// Returns a clean design spec (front + back). Throws RuntimeException (code 501 = AI not set up).
function ai_design_spec($prompt, $product) {
    if (ANTHROPIC_API_KEY === '' && OPENAI_API_KEY === '') throw new RuntimeException('AI is not set up.', 501);
    $shape = '{"background":{"type":"gradient|solid","colors":["#rrggbb","#rrggbb"],"angle":135},"pattern":{"type":"none|dots|stripes|confetti|florals|hearts|stars|waves|grid|sparkles","color":"#rrggbb","opacity":0.3,"density":5},"border":{"style":"none|solid|double|dashed|ornate","color":"#rrggbb","width":3}';
    $system = "You are a print designer. The customer describes a design for a custom printed product (for example an invitation card). Design BOTH the front and the back so they look like one matching set. Reply with ONLY one JSON object, no markdown and no explanation, in exactly this shape:\n" .
        '{"name":"short design name",' . substr($shape, 1) . ',"text":{"color":"#rrggbb","accent":"#rrggbb","headingFont":"FONT","bodyFont":"FONT"},' .
        '"back":' . $shape . ',"text":{"color":"#rrggbb","accent":"#rrggbb"},"lines":["short line 1","optional short line 2"]},' .
        '"insideNote":"a short message for the inside of a folded card, max 80 characters, or an empty string"}' . "\n" .
        'FONT must be one of: ' . implode(', ', SPEC_FONTS) . ". The FRONT is where the customer's own details (names, date, venue) are printed, so keep it uncluttered. " .
        "The BACK uses the same theme and colors, with a short thank-you or tagline in \"lines\" (same language as the request). Make sure every text color has strong contrast with its background.";
    $user = "Product: $product\nDesign request: $prompt";

    if (ANTHROPIC_API_KEY !== '') {
        list($http, $data) = http_json('https://api.anthropic.com/v1/messages', ['x-api-key: ' . ANTHROPIC_API_KEY, 'anthropic-version: 2023-06-01'],
            ['model' => AI_MODEL, 'max_tokens' => 1500, 'system' => $system, 'messages' => [['role' => 'user', 'content' => $user]]]);
        $text = $data['content'][0]['text'] ?? '';
    } else {
        list($http, $data) = http_json('https://api.openai.com/v1/chat/completions', ['Authorization: Bearer ' . OPENAI_API_KEY],
            ['model' => OPENAI_MODEL, 'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]],
             'response_format' => ['type' => 'json_object'], 'max_completion_tokens' => 1500]);
        $text = $data['choices'][0]['message']['content'] ?? '';
    }
    if ($http !== 200 || $text === '') {
        $msg = $data['error']['message'] ?? ('HTTP ' . $http);
        error_log('AI error: ' . $msg);
        throw new RuntimeException('The AI service said: ' . $msg, 502);
    }
    $a = strpos($text, '{'); $b = strrpos($text, '}');
    if ($a === false || $b === false) throw new RuntimeException('The AI answer could not be read.', 502);
    $spec = clean_spec(json_decode(substr($text, $a, $b - $a + 1), true));
    if (!$spec) throw new RuntimeException('The AI answer could not be used.', 502);
    return $spec;
}


// ---- AI picture editing: the customer's own photo + a prompt (Tagalog or English) -> the edited photo ----
function ai_edit_image($rel, $prompt, $service) {
    if (OPENAI_API_KEY === '') throw new RuntimeException('AI picture editing is not set up.', 501);
    if (!preg_match('#^uploads/designs/[a-f0-9]{20}\.(png|jpg|jpeg)$#', $rel) || !is_file(__DIR__ . '/../' . $rel)) throw new RuntimeException('Please upload your picture first.', 400);
    if (!function_exists('curl_init')) throw new RuntimeException('PHP curl is disabled.', 500);
    @set_time_limit(240);
    $abs = realpath(__DIR__ . '/../' . $rel);
    $mime = strtolower(pathinfo($abs, PATHINFO_EXTENSION)) === 'png' ? 'image/png' : 'image/jpeg';
    $instruction = 'Edit this photo for a printed product (' . $service . ") following the customer's instruction, which may be written in Tagalog or English. " .
        "Keep the same person or subject recognizable, and keep the result realistic and print-ready. Customer's instruction: " . $prompt;
    $ch = curl_init('https://api.openai.com/v1/images/edits');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 220, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . OPENAI_API_KEY],
        CURLOPT_POSTFIELDS => ['model' => OPENAI_IMAGE_MODEL, 'prompt' => $instruction, 'image' => new CURLFile($abs, $mime, basename($abs)), 'size' => 'auto', 'quality' => 'medium', 'n' => 1]]);
    if (function_exists('ca_bundle') && ($ca = ca_bundle())) curl_setopt($ch, CURLOPT_CAINFO, $ca);
    $res = curl_exec($ch); $http = curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($res === false) throw new RuntimeException('Could not reach the AI service: ' . $err, 502);
    $data = json_decode((string)$res, true);
    $b64 = $data['data'][0]['b64_json'] ?? '';
    if ($http !== 200 || $b64 === '') {
        $msg = $data['error']['message'] ?? ('HTTP ' . $http);
        error_log('AI image edit error: ' . $msg);
        throw new RuntimeException('The AI service said: ' . $msg, 502);
    }
    $bin = base64_decode($b64, true);
    if ($bin === false || substr($bin, 0, 8) !== "\x89PNG\r\n\x1a\n") throw new RuntimeException('The AI picture could not be used.', 502);
    $out = 'uploads/designs/' . bin2hex(random_bytes(10)) . '.png';
    if (file_put_contents(__DIR__ . '/../' . $out, $bin) === false) throw new RuntimeException('Could not save the AI picture.', 500);
    return $out;
}


// The font + size the customer chose for each of their texts (only known fields, only known fonts)
function clean_styles($styles, array $fields) {
    $out = [];
    if (!is_array($styles)) return $out;
    foreach ($fields as $f) {
        $st = $styles[$f['key']] ?? null;
        if (!is_array($st)) continue;
        $font = in_array($st['font'] ?? '', CUSTOM_FONTS, true) ? $st['font'] : '';
        $scale = round(clamp_num($st['scale'] ?? 1, 0.5, 2.5, 1), 2);
        if ($font === '' && abs($scale - 1) < 0.01) continue;
        $out[$f['key']] = ['font' => $font, 'scale' => $scale];
    }
    return $out;
}


// how the customer moved / zoomed a picture inside its frame (z = zoom, x / y = move as a fraction of the frame)
function clean_crop($c) {
    if (!is_array($c)) return null;
    $z = round(clamp_num($c['z'] ?? 1, 0.3, 4, 1), 3); $x = round(clamp_num($c['x'] ?? 0, -1.5, 1.5, 0), 4); $y = round(clamp_num($c['y'] ?? 0, -1.5, 1.5, 0), 4);
    return (abs($z - 1) < 0.001 && abs($x) < 0.001 && abs($y) < 0.001) ? null : ['z' => $z, 'x' => $x, 'y' => $y];
}
