<?php
// Sends the OTP for real through Gmail SMTP.
// No libraries / Composer needed.

class OtpDeliveryException extends RuntimeException {}

function ca_bundle() {
    $candidates = [
        ini_get('openssl.cafile'), ini_get('curl.cainfo'),
        dirname(PHP_BINARY) . '/curl-ca-bundle.crt',
        dirname(PHP_BINARY) . '/../apache/bin/curl-ca-bundle.crt',
        'C:/xampp/apache/bin/curl-ca-bundle.crt',
    ];
    foreach ($candidates as $f) if ($f && is_file($f)) return $f;
    return null;
}

function deliver_otp($channel, $target, $code) {
    if (APP_DEBUG) {
        file_put_contents(__DIR__ . '/otp-log.txt', date('Y-m-d H:i:s') . " [$channel] $target => $code\n", FILE_APPEND);
        return;
    }
    $minutes = (int)(OTP_TTL / 60);
    if ($channel === 'email') {
        if (MAIL_USER === '' || MAIL_PASS === '') throw new OtpDeliveryException('Email sending is not set up yet (fill in api/config.local.php).');
        smtp_send($target, "Your Happy Queen's verification code",
            "Your Happy Queen's Crafty House verification code is:\r\n\r\n    $code\r\n\r\nIt expires in $minutes minutes. If you didn't request this, you can ignore this email. Never share this code with anyone.");
    } else {
        throw new OtpDeliveryException('Only email codes are supported.');
    }
}

function smtp_send($to, $subject, $body) {
    if (preg_match('/[\r\n]/', $to)) throw new OtpDeliveryException('Invalid email address.');
    $port = (int)MAIL_PORT;

    $ssl = ['verify_peer' => MAIL_VERIFY_SSL, 'verify_peer_name' => MAIL_VERIFY_SSL, 'peer_name' => MAIL_HOST];
    if ($ca = ca_bundle()) $ssl['cafile'] = $ca;
    $ctx = stream_context_create(['ssl' => $ssl]);

    $fp = @stream_socket_client(($port === 465 ? 'ssl://' : 'tcp://') . MAIL_HOST . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) throw new OtpDeliveryException("Could not connect to the mail server ($errstr). If it says certificate verify failed, set MAIL_VERIFY_SSL to false in config.local.php.");
    stream_set_timeout($fp, 15);

    $read = function () use ($fp) {
        $data = '';
        while (($line = fgets($fp, 515)) !== false) {
            $data .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') break;
        }
        return $data;
    };
    $cmd = function ($c, $expect) use ($fp, $read) {
        if ($c !== null) fwrite($fp, $c . "\r\n");
        $r = $read();
        if (substr($r, 0, 3) !== $expect) throw new OtpDeliveryException('Mail server said: ' . trim($r));
        return $r;
    };

    $cmd(null, '220');
    $cmd('EHLO localhost', '250');
    if ($port !== 465) {
        $cmd('STARTTLS', '220');
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new OtpDeliveryException('Could not start TLS with the mail server.');
        $cmd('EHLO localhost', '250');
    }
    $pass = str_replace(' ', '', MAIL_PASS);
    $cmd('AUTH LOGIN', '334');
    $cmd(base64_encode(MAIL_USER), '334');
    try { $cmd(base64_encode($pass), '235'); }
    catch (OtpDeliveryException $e) { throw new OtpDeliveryException('Gmail login failed. Use a Gmail App Password (needs 2-Step Verification), not your normal password.'); }
    $cmd('MAIL FROM:<' . MAIL_USER . '>', '250');
    $cmd('RCPT TO:<' . $to . '>', '250');
    $cmd('DATA', '354');

    $headers = [
        'Date: ' . date('r'),
        'From: =?UTF-8?B?' . base64_encode(MAIL_FROM_NAME) . '?= <' . MAIL_USER . '>',
        'To: <' . $to . '>',
        'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        'Message-ID: <' . bin2hex(random_bytes(8)) . '@happyqueens.local>',
    ];
    fwrite($fp, implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($body)) . "\r\n.\r\n");
    $cmd(null, '250');
    fwrite($fp, "QUIT\r\n");
    fclose($fp);
}
