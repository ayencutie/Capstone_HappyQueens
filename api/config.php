<?php
// Private settings live in config.local.php (DB password, Gmail, SMS key).
if (is_file(__DIR__ . '/config.local.php')) require __DIR__ . '/config.local.php';

function cfg_default($name, $value) { if (!defined($name)) define($name, $value); }

cfg_default('DB_HOST', 'localhost');
cfg_default('DB_NAME', 'happyqueens');
cfg_default('DB_USER', 'root');
cfg_default('DB_PASS', '');

// true  = codes are NOT sent, only written to api/otp-log.txt (testing)
// false = REAL email / SMS sending
cfg_default('APP_DEBUG', false);

// Email (Gmail SMTP)
cfg_default('MAIL_HOST', 'smtp.gmail.com');
cfg_default('MAIL_PORT', 465);              // 465 = SSL, 587 = STARTTLS
cfg_default('MAIL_USER', '');
cfg_default('MAIL_PASS', '');               // Gmail App Password
cfg_default('MAIL_FROM_NAME', "Happy Queen's Crafty House");
cfg_default('MAIL_VERIFY_SSL', true);

cfg_default('OTP_TTL', 600);                // code valid for 10 minutes
cfg_default('OTP_MAX_ATTEMPTS', 5);         // wrong guesses allowed per code
cfg_default('OTP_RESEND_WAIT', 30);         // seconds between resends

if (PHP_SAPI !== 'cli') {
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
    header('Content-Type: application/json; charset=utf-8');
}

function db() {
    static $pdo = null;
    if (!$pdo) {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

function out(array $data, $code = 200) { http_response_code($code); echo json_encode($data); exit; }
function fail($msg, $code = 400) { out(['ok' => false, 'error' => $msg], $code); }
function input() { $d = json_decode(file_get_contents('php://input'), true); return is_array($d) ? $d : []; }

function normalize_phone($p) {
    $p = preg_replace('/[\s-]/', '', (string)$p);
    return substr($p, 0, 3) === '+63' ? '0' . substr($p, 3) : $p;
}
function mask_email($e) {
    $parts = explode('@', $e);
    $v = substr($parts[0], 0, 2);
    return $v . str_repeat('*', max(strlen($parts[0]) - strlen($v), 1)) . '@' . $parts[1];
}
function mask_phone($p) { return substr($p, 0, 4) . ' *** ' . substr($p, -3); }

require __DIR__ . '/delivery.php';

// ---- OTP storage --------------------------------------------------------------
// Returns false if the user asked for a code too soon.
function issue_otp($userId, $purpose, $channel, $target) {
    $s = db()->prepare('SELECT created_at FROM otp_codes WHERE user_id=? AND purpose=? ORDER BY id DESC');
    $s->execute([$userId, $purpose]);
    $last = $s->fetchColumn();
    if ($last && time() - (int)$last < OTP_RESEND_WAIT) return false;

    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    deliver_otp($channel, $target, $code);   // send first; if it fails, nothing is stored

    db()->prepare('UPDATE otp_codes SET used=1 WHERE user_id=? AND purpose=?')->execute([$userId, $purpose]);
    db()->prepare('INSERT INTO otp_codes (user_id,purpose,code_hash,created_at,expires_at) VALUES (?,?,?,?,?)')
        ->execute([$userId, $purpose, password_hash($code, PASSWORD_DEFAULT), time(), time() + OTP_TTL]);
    return true;
}

function check_otp($userId, $purpose, $code) {
    $s = db()->prepare('SELECT * FROM otp_codes WHERE user_id=? AND purpose=? AND used=0 ORDER BY id DESC');
    $s->execute([$userId, $purpose]);
    $row = $s->fetch();
    if (!$row || $row['expires_at'] < time() || $row['attempts'] >= OTP_MAX_ATTEMPTS) return false;
    if (!password_verify($code, $row['code_hash'])) {
        db()->prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?')->execute([$row['id']]);
        return false;
    }
    db()->prepare('UPDATE otp_codes SET used=1 WHERE id=?')->execute([$row['id']]);
    return true;
}
