<?php
require __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';
if ($_SERVER['REQUEST_METHOD'] !== 'POST' && !in_array($action, ['me', 'pending', 'profile'], true)) fail('Method not allowed', 405);
$in = input();

function pw_error($pw) {
    if (strlen($pw) < 8 || !preg_match('/[A-Z]/', $pw) || !preg_match('/[a-z]/', $pw) || !preg_match('/\d/', $pw))
        return 'Password needs 8+ characters with an uppercase letter, a lowercase letter and a number.';
    return null;
}
function user_by_id($id) {
    $s = db()->prepare('SELECT * FROM users WHERE id=?'); $s->execute([$id]);
    return $s->fetch() ?: null;
}
function member() {   // the logged-in customer (from the database)
    if (($_SESSION['user']['role'] ?? '') !== 'customer') fail('Please log in first.', 401);
    $u = user_by_id((int)$_SESSION['user']['id']);
    if (!$u) fail('Please log in first.', 401);
    return $u;
}
function login_user($u) {
    session_regenerate_id(true);
    $_SESSION = ['user' => ['id' => (int)$u['id'], 'role' => $u['role'], 'firstName' => $u['first_name']]];
}

try {
    switch ($action) {

    // --- Create account (customers only) -----------------------------------
    case 'register':
        $first = trim($in['firstName'] ?? ''); $last = trim($in['lastName'] ?? '');
        $phone = normalize_phone($in['contactNo'] ?? '');
        $email = strtolower(trim($in['email'] ?? ''));
        $pw    = (string)($in['password'] ?? '');

        if ($first === '' || $last === '' || mb_strlen($first) > 60 || mb_strlen($last) > 60) fail('Please enter your first and last name.');
        if (!preg_match('/^09\d{9}$/', $phone)) fail('Please enter a valid Philippine mobile number.');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Please enter a valid email address.');
        if ($e = pw_error($pw)) fail($e);

        $s = db()->prepare('SELECT COUNT(*) FROM users WHERE (email=? OR contact_no=?) AND is_verified=1');
        $s->execute([$email, $phone]);
        if ($s->fetchColumn() > 0) fail('An account with that email or phone number already exists.', 409);

        // abandoned, never-verified sign-ups can be retried
        db()->prepare('DELETE FROM users WHERE (email=? OR contact_no=?) AND is_verified=0')->execute([$email, $phone]);
        db()->prepare('INSERT INTO users (first_name,last_name,contact_no,email,password_hash) VALUES (?,?,?,?,?)')
            ->execute([$first, $last, $phone, $email, password_hash($pw, PASSWORD_DEFAULT)]);
        $id = (int)db()->lastInsertId();

        $_SESSION['pending_user_id'] = $id;
        issue_otp($id, 'register', 'email', $email);
        out(['ok' => true]);

    // --- Info for the verify pages -----------------------------------------
    case 'pending':
        $u = user_by_id((int)($_SESSION['pending_user_id'] ?? 0));
        if (!$u || $u['is_verified']) fail('No pending registration.', 401);
        out(['ok' => true, 'emailMasked' => mask_email($u['email']), 'phoneMasked' => mask_phone($u['contact_no'])]);

    // --- Resend a code ------------------------------------------------------
    case 'resend_otp':
        $purpose = $in['purpose'] ?? '';
        if ($purpose === 'register') {
            $uid = (int)($_SESSION['pending_user_id'] ?? 0);
            $channel = 'email';
        } elseif ($purpose === 'reset') {
            $uid = (int)($_SESSION['reset_pending_user_id'] ?? 0);
            $channel = $_SESSION['reset_channel'] ?? 'email';
        } else fail('Invalid request.');
        $u = $uid ? user_by_id($uid) : null;
        if (!$u) fail('Session expired. Please start again.', 401);
        $target = $channel === 'sms' ? $u['contact_no'] : $u['email'];
        if (!issue_otp((int)$u['id'], $purpose, $channel, $target)) fail('Please wait a moment before requesting another code.', 429);
        out(['ok' => true]);

    // --- Verify a code ------------------------------------------------------
    case 'verify_otp':
        $purpose = $in['purpose'] ?? '';
        $code = preg_replace('/\D/', '', (string)($in['code'] ?? ''));
        if (strlen($code) !== 6) fail('Please enter all 6 digits.');

        if ($purpose === 'register') {
            $u = user_by_id((int)($_SESSION['pending_user_id'] ?? 0));
            if (!$u) fail('Session expired. Please register again.', 401);
            if (!check_otp((int)$u['id'], 'register', $code)) fail("That code didn't match or has expired.", 422);
            db()->prepare('UPDATE users SET is_verified=1 WHERE id=?')->execute([$u['id']]);
            login_user($u);   // new customers are logged in right away
            out(['ok' => true]);
        }
        if ($purpose === 'reset') {
            $u = user_by_id((int)($_SESSION['reset_pending_user_id'] ?? 0));
            if (!$u || !check_otp((int)$u['id'], 'reset', $code)) fail("That code didn't match or has expired.", 422);
            $_SESSION['reset_user_id'] = (int)$u['id'];
            $_SESSION['reset_until'] = time() + 900;
            out(['ok' => true]);
        }
        fail('Invalid request.');

    // --- Log in -------------------------------------------------------------
    case 'login':
        $id = trim($in['identifier'] ?? ''); $pw = (string)($in['password'] ?? '');
        if ($id === '' || $pw === '') fail('Please enter your email or phone number, and your password.');

        if (strpos($id, '@') !== false) { $s = db()->prepare('SELECT * FROM users WHERE email=?'); $s->execute([strtolower($id)]); }
        else                        { $s = db()->prepare('SELECT * FROM users WHERE contact_no=?'); $s->execute([normalize_phone($id)]); }
        $u = $s->fetch();

        if ($u && $u['locked_until'] > time()) fail('Too many failed attempts. Try again in a few minutes.', 429);

        if (!$u || !$u['is_verified'] || !$u['password_hash'] || !password_verify($pw, $u['password_hash'])) {
            if ($u) {
                $n = $u['failed_attempts'] + 1;
                db()->prepare('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?')
                    ->execute([$n >= 5 ? 0 : $n, $n >= 5 ? time() + 900 : 0, $u['id']]);
            }
            fail('Incorrect email/phone or password.', 401);
        }
        db()->prepare('UPDATE users SET failed_attempts=0, locked_until=0 WHERE id=?')->execute([$u['id']]);
        login_user($u);
        out(['ok' => true, 'role' => $u['role']]);

    // --- Current session ------------------------------------------------------
    case 'me':
        if (empty($_SESSION['user'])) fail('Not logged in.', 401);
        out(['ok' => true, 'user' => $_SESSION['user']]);

    case 'logout':
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);

    // --- Forgot / reset password -----------------------------------------------
    case 'forgot':
        $method = 'email';
        $value  = trim($in['value'] ?? '');
        unset($_SESSION['reset_pending_user_id'], $_SESSION['reset_user_id'], $_SESSION['reset_until']);

        if ($method === 'email') { $s = db()->prepare('SELECT * FROM users WHERE email=? AND is_verified=1'); $s->execute([strtolower($value)]); }
        else                     { $s = db()->prepare('SELECT * FROM users WHERE contact_no=? AND is_verified=1'); $s->execute([normalize_phone($value)]); }
        $u = $s->fetch();
        if ($u) {
            $_SESSION['reset_pending_user_id'] = (int)$u['id'];
            $_SESSION['reset_channel'] = $method === 'phone' ? 'sms' : 'email';
            issue_otp((int)$u['id'], 'reset', $_SESSION['reset_channel'], $method === 'phone' ? $u['contact_no'] : $u['email']);
        }
        out(['ok' => true]);   // same answer whether or not the account exists

    case 'reset':
        $uid = (int)($_SESSION['reset_user_id'] ?? 0);
        if (!$uid || ($_SESSION['reset_until'] ?? 0) < time()) fail('Your reset session expired. Please start again.', 401);
        $pw = (string)($in['password'] ?? '');
        if ($e = pw_error($pw)) fail($e);
        db()->prepare('UPDATE users SET password_hash=?, failed_attempts=0, locked_until=0 WHERE id=?')
            ->execute([password_hash($pw, PASSWORD_DEFAULT), $uid]);
        unset($_SESSION['reset_user_id'], $_SESSION['reset_pending_user_id'], $_SESSION['reset_until']);
        out(['ok' => true]);

    // ---------------- My profile / settings ----------------
    case 'profile':
        $u = member();
        $c = db()->prepare("SELECT COUNT(*) AS total, COALESCE(SUM(status NOT IN ('completed','cancelled')),0) AS open_orders FROM orders WHERE user_id=?");
        $c->execute([$u['id']]); $n = $c->fetch();
        out(['ok' => true, 'profile' => ['firstName' => $u['first_name'], 'lastName' => $u['last_name'], 'email' => $u['email'], 'contactNo' => $u['contact_no'],
             'address' => $u['address'] ?? '', 'landmark' => $u['landmark'] ?? '', 'since' => substr($u['created_at'], 0, 10), 'orders' => (int)$n['total'], 'openOrders' => (int)$n['open_orders']]]);

    case 'update_profile':
        $u = member();
        $first = trim($in['firstName'] ?? ''); $last = trim($in['lastName'] ?? ''); $phone = normalize_phone($in['contactNo'] ?? '');
        if ($first === '' || $last === '' || mb_strlen($first) > 60 || mb_strlen($last) > 60) fail('Please enter your first and last name.');
        if (!preg_match('/^09\d{9}$/', $phone)) fail('Please enter a valid Philippine mobile number.');
        $q = db()->prepare('SELECT COUNT(*) FROM users WHERE contact_no=? AND id<>?'); $q->execute([$phone, $u['id']]);
        if ($q->fetchColumn() > 0) fail('That phone number is already used by another account.', 409);
        $addr = mb_substr(trim((string)($in['address'] ?? '')), 0, 300); $land = mb_substr(trim((string)($in['landmark'] ?? '')), 0, 150);
        db()->prepare('UPDATE users SET first_name=?, last_name=?, contact_no=?, address=?, landmark=? WHERE id=?')->execute([$first, $last, $phone, $addr, $land, $u['id']]);
        $_SESSION['user']['firstName'] = $first;
        out(['ok' => true]);

    case 'change_password':
        $u = member();
        $cur = (string)($in['currentPassword'] ?? ''); $new = (string)($in['newPassword'] ?? '');
        if (!$u['password_hash'] || !password_verify($cur, $u['password_hash'])) fail('Your current password is not correct.', 403);
        if ($e = pw_error($new)) fail($e);
        if ($cur === $new) fail('Your new password must be different from the current one.');
        db()->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        session_regenerate_id(true);
        out(['ok' => true]);

    case 'delete_account':
        $u = member();
        if (!$u['password_hash'] || !password_verify((string)($in['password'] ?? ''), $u['password_hash'])) fail('Your password is not correct.', 403);
        $q = db()->prepare("SELECT COUNT(*) FROM orders WHERE user_id=? AND status NOT IN ('completed','cancelled')"); $q->execute([$u['id']]);
        if ($q->fetchColumn() > 0) fail('You still have orders in progress. Please wait until they are completed or cancel them first.');
        db()->prepare('DELETE FROM users WHERE id=?')->execute([$u['id']]);   // old orders stay for our records, without your name
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);

    case 'google':
        fail('Google sign-in is not set up yet.', 501);

    default:
        fail('Unknown action.', 404);
    }
} catch (OtpDeliveryException $e) {
    error_log($e->getMessage());
    fail('We could not send your code. ' . $e->getMessage(), 502);
} catch (PDOException $e) {
    error_log($e->getMessage());
    fail($e->getCode() === '23000' ? 'An account with that email or phone number already exists.' : 'Server error. Is MySQL running and the database imported?', $e->getCode() === '23000' ? 409 : 500);
} catch (Throwable $e) {
    error_log($e->getMessage());
    fail('Server error.', 500);
}
