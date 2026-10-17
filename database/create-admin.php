<?php
// Run ONCE from command line:  php database/create-admin.php "YourStrongPassword"
// Creates the admin account (admins never register through the website).
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('CLI only'); }
require __DIR__ . '/../api/config.php';

$pw = $argv[1] ?? '';
if (strlen($pw) < 8) exit("Usage: php create-admin.php \"password (8+ chars)\"\n");

$email = 'admin@happyqueens.com';
db()->prepare("DELETE FROM users WHERE email = ?")->execute([$email]);
db()->prepare("INSERT INTO users (first_name,last_name,contact_no,email,password_hash,role,is_verified)
               VALUES ('Admin','HQ','09000000000',?,?,'admin',1)")
    ->execute([$email, password_hash($pw, PASSWORD_DEFAULT)]);
echo "Admin created: $email\n";
