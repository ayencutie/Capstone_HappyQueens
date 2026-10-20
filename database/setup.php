<?php
// Open once in the browser:  http://localhost/HappyQueens/database/setup.php
// Creates / updates the database (safe to run again after every update) and checks that everything works.
// DELETE this file before putting the site online.
require __DIR__ . '/../api/config.php';
require __DIR__ . '/../api/lib.php';
header('Content-Type: text/html; charset=utf-8');
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) { http_response_code(403); exit('Localhost only.'); }

if (isset($_GET['testmail'])) {   // real sending test: ?testmail=you@gmail.com
    try {
        deliver_otp('email', $_GET['testmail'], '123456');
        exit(APP_DEBUG ? 'APP_DEBUG is true, so it was only written to api/otp-log.txt. Set it to false in config.local.php.' : '✅ Sent! Check the inbox (test code 123456).');
    } catch (Throwable $e) { exit('❌ ' . htmlspecialchars($e->getMessage())); }
}
if (isset($_GET['testrembg'])) {   // is rembg installed in that Python?
    $l = []; exec(escapeshellarg(REMBG_PYTHON) . ' -c ' . escapeshellarg("import rembg; print('rembg OK')") . ' 2>&1', $l, $c);
    exit(($c === 0 ? '✅ ' : '❌ ') . htmlspecialchars(implode("\n", $l) ?: 'Python not found at ' . REMBG_PYTHON));
}
if (isset($_GET['warmrembg'])) {   // first run: downloads the model (a few minutes, needs internet) so customers don't wait
    $t0 = microtime(true); $in = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'hq_warm_in.png'; $out = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'hq_warm_out.png';
    file_put_contents($in, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
    list($c, $o) = rembg_run($in, $out);
    exit('<pre>' . ($c === 0 ? '✅ Done' : 'Finished with a message (this can be normal for a 1px test image)') . ' in ' . round(microtime(true) - $t0) . " s\n" . htmlspecialchars($o) . '</pre>');
}
if (isset($_GET['otp'])) {   // viewer for test-mode OTP codes
    echo '<meta http-equiv="refresh" content="5"><pre style="font:16px monospace">';
    $f = __DIR__ . '/../api/otp-log.txt';
    echo htmlspecialchars(is_file($f) ? implode('', array_slice(file($f), -10)) : 'No codes yet.');
    exit('</pre>');
}

$rows = [];
function step($label, $ok, $detail = '') {
    global $rows;
    $rows[] = '<li>' . ($ok ? '✅' : '❌') . ' <b>' . htmlspecialchars($label) . '</b> ' . htmlspecialchars($detail) . '</li>';
    return $ok;
}
function add_col($pdo, $table, $col, $ddl) {
    $s = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?');
    $s->execute([DB_NAME, $table, $col]);
    if (!$s->fetchColumn()) { $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$col` $ddl"); return true; }
    return false;
}

$good = step('PHP version', version_compare(PHP_VERSION, '7.3', '>='), PHP_VERSION);
$good = step('pdo_mysql extension', extension_loaded('pdo_mysql')) && $good;
step('curl extension (payments + AI)', function_exists('curl_init'), function_exists('curl_init') ? '' : 'enable extension=curl in php.ini');

if ($good) {
    try {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        step('Connected to MySQL', true);
        $pdo->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $pdo->exec('USE `' . DB_NAME . '`');

        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            first_name VARCHAR(60) NOT NULL, last_name VARCHAR(60) NOT NULL,
            contact_no VARCHAR(15) NOT NULL UNIQUE, email VARCHAR(190) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NULL,
            role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
            is_verified TINYINT(1) NOT NULL DEFAULT 0,
            failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
            locked_until INT UNSIGNED NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
        $pdo->exec("CREATE TABLE IF NOT EXISTS otp_codes (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNSIGNED NOT NULL,
            purpose ENUM('register','reset') NOT NULL,
            code_hash VARCHAR(255) NOT NULL,
            attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
            used TINYINT(1) NOT NULL DEFAULT 0,
            created_at INT UNSIGNED NOT NULL, expires_at INT UNSIGNED NOT NULL,
            INDEX (user_id, purpose),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB");
        $pdo->exec("CREATE TABLE IF NOT EXISTS services (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(80) NOT NULL,
            description VARCHAR(160) NOT NULL DEFAULT '',
            price_text VARCHAR(40) NOT NULL DEFAULT '',
            image_path VARCHAR(255) NULL,
            order_url VARCHAR(190) NOT NULL DEFAULT '',
            needs_template TINYINT(1) NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 0,
            occasions TEXT NULL, choices MEDIUMTEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
        $pdo->exec("CREATE TABLE IF NOT EXISTS templates (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            service_id INT UNSIGNED NOT NULL,
            occasion VARCHAR(60) NOT NULL DEFAULT 'Other',
            file_path VARCHAR(255) NOT NULL, original_name VARCHAR(190) NOT NULL, mime VARCHAR(60) NOT NULL,
            size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX (service_id),
            FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE) ENGINE=InnoDB");
        $pdo->exec("CREATE TABLE IF NOT EXISTS orders (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            order_code VARCHAR(20) NULL UNIQUE,
            user_id INT UNSIGNED NULL, service_id INT UNSIGNED NULL,
            service_name VARCHAR(80) NOT NULL,
            qty INT UNSIGNED NOT NULL DEFAULT 1,
            total DECIMAL(10,2) NOT NULL DEFAULT 0,
            payment VARCHAR(30) NOT NULL DEFAULT 'Cash',
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            details MEDIUMTEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX (status),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL) ENGINE=InnoDB");

        // columns added in later versions (adds only what's missing)
        add_col($pdo, 'services', 'preview_mode', "VARCHAR(8) NOT NULL DEFAULT 'flat'");
        add_col($pdo, 'services', 'shapes', "VARCHAR(80) NOT NULL DEFAULT '[\"no-fold\"]'");
        add_col($pdo, 'services', 'ratio_w', 'DECIMAL(6,2) NOT NULL DEFAULT 5');
        add_col($pdo, 'services', 'ratio_h', 'DECIMAL(6,2) NOT NULL DEFAULT 7');
        add_col($pdo, 'services', 'text_position', "VARCHAR(8) NOT NULL DEFAULT 'center'");
        add_col($pdo, 'services', 'ai_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');
        add_col($pdo, 'services', 'upload_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');
        add_col($pdo, 'services', 'info_fields', 'MEDIUMTEXT NULL');
        $addedMatrix = add_col($pdo, 'services', 'price_matrix', 'MEDIUMTEXT NULL');
        add_col($pdo, 'services', 'unit_label', "VARCHAR(20) NOT NULL DEFAULT 'pc'");
        add_col($pdo, 'users', 'address', 'VARCHAR(300) NULL');
        add_col($pdo, 'users', 'landmark', 'VARCHAR(150) NULL');
        $addedProduct = add_col($pdo, 'services', 'product_type', "VARCHAR(10) NOT NULL DEFAULT 'paper'");
        $addedCut = add_col($pdo, 'services', 'cut_shapes', "VARCHAR(120) NOT NULL DEFAULT '[]'");
        add_col($pdo, 'services', 'cut_hole', 'TINYINT(1) NOT NULL DEFAULT 0');
        $addedNeedsInfo = add_col($pdo, 'services', 'needs_info', 'TINYINT(1) NOT NULL DEFAULT 1');
        add_col($pdo, 'orders', 'payment_id', 'VARCHAR(40) NULL');
        add_col($pdo, 'orders', 'paid_at', 'DATETIME NULL');
        add_col($pdo, 'orders', 'refund_status', "VARCHAR(10) NOT NULL DEFAULT 'none'");
        add_col($pdo, 'orders', 'refund_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
        add_col($pdo, 'orders', 'refund_id', 'VARCHAR(40) NULL');
        add_col($pdo, 'orders', 'refund_note', 'VARCHAR(190) NULL');
        add_col($pdo, 'orders', 'fulfillment', "VARCHAR(10) NOT NULL DEFAULT 'pickup'");
        add_col($pdo, 'orders', 'delivery_fee', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
        add_col($pdo, 'orders', 'delivery_status', "VARCHAR(10) NOT NULL DEFAULT 'none'");
        add_col($pdo, 'orders', 'delivery_session', 'VARCHAR(80) NULL');
        add_col($pdo, 'orders', 'delivery_payment_id', 'VARCHAR(40) NULL');
        add_col($pdo, 'orders', 'delivery_paid_at', 'DATETIME NULL');
        add_col($pdo, 'orders', 'lalamove_ref', 'VARCHAR(190) NULL');
        $pdo->exec("CREATE TABLE IF NOT EXISTS inquiries (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNSIGNED NULL,
            name VARCHAR(80) NOT NULL, contact VARCHAR(80) NOT NULL, service_name VARCHAR(80) NOT NULL,
            qty INT UNSIGNED NOT NULL DEFAULT 1,
            details TEXT NULL, files TEXT NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'new',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX (status),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB");
        if ($addedNeedsInfo) $pdo->exec("UPDATE services SET needs_info=0 WHERE name IN ('Photo Print','Documents')");
        add_col($pdo, 'orders', 'payment_status', "VARCHAR(10) NOT NULL DEFAULT 'unpaid'");
        add_col($pdo, 'orders', 'pay_option', "VARCHAR(6) NOT NULL DEFAULT 'down'");
        add_col($pdo, 'orders', 'amount_due', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
        add_col($pdo, 'orders', 'amount_paid', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
        add_col($pdo, 'orders', 'checkout_session', 'VARCHAR(80) NULL');
        add_col($pdo, 'orders', 'design_image', 'VARCHAR(255) NULL');
        $pdo->exec('ALTER TABLE orders MODIFY details MEDIUMTEXT NULL');
        step('Database "' . DB_NAME . '" + tables ready', true);

        // starter services (first run only)
        if (!$pdo->query('SELECT COUNT(*) FROM services')->fetchColumn()) {
            $seed = [['Documents', 'Printing, scanning & copies', 'hq-documents', 0], ['Stickers', 'Custom cut & sheet stickers', 'hq-stickers', 0],
                     ['Ref Magnets', 'Photo fridge magnets', 'hq-magnets', 0], ['Keychains', 'Personalized photo keychains', 'hq-keychains', 0],
                     ['ID Photo', '1x1, 2x2 & passport size', 'hq-idphoto', 0], ['Instax Photo Cards', 'Square, mini & wide prints', 'hq-instax', 0],
                     ['Photo Strips', 'Photobooth-style strips', 'hq-photostrips', 0], ['Photo Print', '2R up to A4 sizes', 'hq-photoprint', 0],
                     ['Business Cards', 'Custom or AI-generated designs', 'hq-bizcards', 1], ['Invitation Cards', 'Custom or AI-generated designs', 'hq-invites', 1]];
            $ins = $pdo->prepare('INSERT INTO services (name,description,needs_template,image_path,sort_order,occasions,choices) VALUES (?,?,?,?,?,?,?)');
            foreach ($seed as $i => $r) $ins->execute([$r[0], $r[1], $r[3], 'https://picsum.photos/seed/' . $r[2] . '/400/300', $i + 1,
                json_encode(['Wedding', 'Birthday', 'Debut', 'Christening', 'Anniversary', 'Corporate', 'Other']), '[]']);
            step('Added 10 starter services', true);
        }
        // there is now ONE order page for every service
        $pdo->exec("UPDATE services SET order_url='' WHERE order_url IN ('order.html','order-sticker.html','order-id.html','order-instax.html','order-photop.html')");

        // preview / info-field defaults for services that don't have them yet (edit anytime in Admin > Services)
        $f = function ($label, $type = 'text', $req = false) { return ['label' => $label, 'type' => $type, 'required' => $req, 'key' => strtolower(preg_replace('/[^a-z0-9]+/i', '_', $label))]; };
        $defaults = [
            'Invitation Cards'   => ['3d', ['no-fold', 'two-fold'], 5, 7, 'center', 1, [$f('Name / Celebrant', 'text', true), $f('Event'), $f('Date', 'date', true), $f('Time', 'time'), $f('Venue / Address', 'textarea', true), $f('Message / Description', 'textarea')]],
            'Business Cards'     => ['3d', ['no-fold'], 3.5, 2, 'center', 1, [$f('Full Name', 'text', true), $f('Job Title'), $f('Phone', 'text', true), $f('Email'), $f('Company / Address')]],
            'ID Photo'           => ['flat', ['no-fold'], 1, 1, 'bottom', 0, [$f('Name below photo')]],
            'Instax Photo Cards' => ['flat', ['no-fold'], 2.1, 3.4, 'bottom', 0, [$f('Caption')]],
            'Photo Strips'       => ['flat', ['no-fold'], 2, 6, 'bottom', 0, [$f('Caption')]],
            'Stickers'           => ['flat', ['no-fold'], 3, 3, 'center', 1, [$f('Text on sticker')]],
            'Ref Magnets'        => ['flat', ['no-fold'], 2, 3, 'bottom', 0, [$f('Caption')]],
            'Keychains'          => ['flat', ['no-fold'], 2, 3, 'bottom', 0, [$f('Name / Text')]],
            'Photo Print'        => ['flat', ['no-fold'], 4, 6, 'bottom', 0, []],
            'Documents'          => ['flat', ['no-fold'], 8.5, 11, 'center', 0, []],
        ];
        $up = $pdo->prepare('UPDATE services SET preview_mode=?, shapes=?, ratio_w=?, ratio_h=?, text_position=?, ai_enabled=?, info_fields=? WHERE name=? AND info_fields IS NULL');
        foreach ($defaults as $name => $d) $up->execute([$d[0], json_encode($d[1]), $d[2], $d[3], $d[4], $d[5], json_encode($d[6]), $name]);
        $pdo->exec("UPDATE services SET info_fields='[]' WHERE info_fields IS NULL");
        if ($addedCut) {   // keychains + magnets can be cut into shapes (first time only; change it in Admin > Services > Settings)
            $pdo->prepare("UPDATE services SET cut_shapes=?, preview_mode='3d', text_position='center', ai_enabled=1 WHERE name IN ('Keychains','Ref Magnets')")->execute([json_encode(['circle', 'triangle', 'square', 'photo'])]);
            $pdo->exec("UPDATE services SET cut_hole=1 WHERE name='Keychains'");
        }
        if ($addedMatrix) {   // Documents: a price table (paper size x print color). These prices are SAMPLES: edit them in Admin > Services > Documents > Choices.
            $choices = [
                ['id' => 'g_size', 'name' => 'Paper size', 'required' => true, 'options' => [['id' => 'sz_a4', 'name' => 'A4', 'price' => 0], ['id' => 'sz_short', 'name' => 'Short', 'price' => 0], ['id' => 'sz_long', 'name' => 'Long', 'price' => 0]]],
                ['id' => 'g_color', 'name' => 'Print color', 'required' => true, 'options' => [['id' => 'cl_bw', 'name' => 'Black & white', 'price' => 0], ['id' => 'cl_col', 'name' => 'Colored', 'price' => 0]]],
            ];
            $matrix = ['groups' => ['g_size', 'g_color'], 'prices' => ['sz_a4|cl_bw' => 2, 'sz_a4|cl_col' => 3, 'sz_short|cl_bw' => 2, 'sz_short|cl_col' => 3, 'sz_long|cl_bw' => 3, 'sz_long|cl_col' => 4]];
            $pdo->prepare("UPDATE services SET choices=?, price_matrix=?, unit_label='page' WHERE name='Documents' AND (choices IS NULL OR choices='[]')")->execute([json_encode($choices), json_encode($matrix)]);
        }
        if ($addedProduct) {   // how each product looks (3D + its back). Change it in Admin > Services > Settings.
            $pdo->exec("UPDATE services SET product_type='magnet' WHERE name='Ref Magnets'");
            $pdo->exec("UPDATE services SET product_type='keychain' WHERE name='Keychains'");
            $pdo->exec("UPDATE services SET product_type='sticker' WHERE name='Stickers'");
            $pdo->exec("UPDATE services SET product_type='photo' WHERE name IN ('Photo Print','ID Photo','Instax Photo Cards','Photo Strips')");
        }
        step('Services updated (preview, 3D shapes, info fields)', true);

        $has = $pdo->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn();
        if (!$has) {
            $pw = $_GET['pw'] ?? 'Admin@123';
            $pdo->prepare("INSERT INTO users (first_name,last_name,contact_no,email,password_hash,role,is_verified)
                           VALUES ('Admin','HQ','09000000000','admin@happyqueens.com',?,'admin',1)")
                ->execute([password_hash($pw, PASSWORD_DEFAULT)]);
            step('Admin created', true, 'admin@happyqueens.com / ' . $pw);
        } else {
            step('Admin account already exists', true);
        }

        foreach (['api' => 'OTP log', 'uploads' => 'service photos + templates', 'uploads/designs' => 'customer designs', 'uploads/inquiries' => 'inquiry files'] as $dir => $why) {
            $path = __DIR__ . '/../' . $dir;
            if (!is_dir($path)) @mkdir($path, 0775, true);
            step($dir . ' folder writable (' . $why . ')', is_writable($path));
        }
        step('PayMongo key set (GCash / PayMaya)', PAYMONGO_SECRET !== '', PAYMONGO_SECRET === '' ? 'add PAYMONGO_SECRET in api/config.local.php' : '');
        step('Background remover (rembg / Python)', rembg_ready(), rembg_ready() ? 'found. Run ?testrembg=1 then ?warmrembg=1 once' : 'not found at ' . REMBG_PYTHON . ' (the built-in remover is used instead)');
        step('AI key set (optional)', ANTHROPIC_API_KEY !== '', ANTHROPIC_API_KEY === '' ? 'not set: the built-in designer is used' : '');
    } catch (Throwable $e) {
        step('MySQL', false, $e->getMessage() . '  → Is MySQL started in XAMPP? Check DB_USER / DB_PASS in api/config.local.php.');
    }
}
?><!DOCTYPE html><meta charset="utf-8"><title>HappyQueens setup</title>
<body style="font:16px/1.7 system-ui;max-width:680px;margin:40px auto">
<h2>HappyQueens setup</h2><ul style="list-style:none;padding:0"><?= implode('', $rows) ?></ul>
<p>Background remover: <a href="?testrembg=1" target="_blank">test rembg</a> &middot; <a href="?warmrembg=1" target="_blank">download the model (first time)</a></p>
<p>Test real email: add <code>?testmail=youremail@gmail.com</code> to this page's URL.<br>Test-mode codes (APP_DEBUG on): <a href="?otp=1" target="_blank">view codes</a></p>
<p><b>Delete this file</b> when you're done.</p></body>
