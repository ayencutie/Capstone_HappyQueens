# Happy Queen's Crafty House

PHP + MySQL (XAMPP / phpMyAdmin). Put this folder in `C:\xampp\htdocs\HappyQueens`.

## Setup
1. XAMPP Control Panel → start **Apache** and **MySQL**.
2. Open http://localhost/HappyQueens/database/setup.php  (creates the DB, tables, admin). Delete that file when done.
3. Open `api/config.local.php` and fill in your Gmail details (see comments inside).
4. Test sending: http://localhost/HappyQueens/database/setup.php?testmail=youremail@gmail.com
5. Open http://localhost/HappyQueens/  (never double-click the .html files).

Admin login: admin@happyqueens.com / Admin@123 (change it).

## Folders
- `api/` – backend (auth.php = all actions, delivery.php = email/SMS sending, config*.php)
- `database/` – setup.php, happyqueens.sql (optional manual import), create-admin.php
- `client-side/html|css|js` – the website
- `images/` – put `right side.png` here

## Protect admin-dashboard.html
Add to the page: `<script src="client-side/js/api.js"></script>` and
`hqApi('me').then(r => { if (!r.ok || r.user.role !== 'admin') location.replace('client-side/html/index.html'); });`
