<?php
// Open once in the browser:  http://localhost/HappyQueens/database/setup.php
// It creates the database + tables + admin account and checks that everything works.
// DELETE this file before putting the site online.
require __DIR__ . '/../api/config.php';
header('Content-Type: text/html; charset=utf-8');
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) { http_response_code(403); exit('Localhost only.'); }

if (isset($_GET['testmail'])) {   // try real sending: ?testmail=you@gmail.com
    try {
        deliver_otp('email', $_GET['testmail'], '123456');
        exit(APP_DEBUG ? 'APP_DEBUG is true, so it was only written to api/otp-log.txt. Set it to false in config.local.php.' : '✅ Sent! Check the inbox (test code 123456).');
    } catch (Throwable $e) { exit('❌ ' . htmlspecialchars($e->getMessage())); }
}

if (isset($_GET['otp'])) {   // handy viewer for test OTP codes
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

$good = step('PHP version', version_compare(PHP_VERSION, '7.3', '>='), PHP_VERSION);
$good = step('pdo_mysql extension', extension_loaded('pdo_mysql')) && $good;

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
        step('Database "' . DB_NAME . '" + tables ready', true);

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
        step('api folder writable (for OTP log)', is_writable(__DIR__ . '/../api'));
    } catch (Throwable $e) {
        step('MySQL', false, $e->getMessage() . '  → Is MySQL started in XAMPP? Check DB_USER / DB_PASS in api/config.php.');
    }
}
?><!DOCTYPE html><meta charset="utf-8"><title>HappyQueens setup</title>
<body style="font:16px/1.7 system-ui;max-width:640px;margin:40px auto">
<h2>HappyQueens setup</h2><ul style="list-style:none;padding:0"><?= implode('', $rows) ?></ul>
<p>Test real sending: add <code>?testmail=youremail@gmail.com</code> to this page's URL.<br>Test-mode codes (APP_DEBUG on): <a href="?otp=1" target="_blank">view codes</a></p>
<p><b>Delete this file</b> when you're done.</p></body>
