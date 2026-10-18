# Happy Queen's Crafty House

PHP + MySQL (XAMPP / phpMyAdmin). Put this folder in `C:\xampp\htdocs\HappyQueens`.

## Setup
1. XAMPP Control Panel → start **Apache** and **MySQL**.
2. Open http://localhost/HappyQueens/database/setup.php  (creates the DB, tables, admin and the starter services). Run it again after every update of this project; it only adds what's missing. Delete that file when done.
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

## Admin panel (connected to MySQL)
- `admin-services.html` – add / edit / hide / delete services, photos, occasions, choices, "needs a template".
- `template-page.html` – one folder per service that needs a template; uploads are stored in `uploads/templates/`.
- `admin-orders.html`, `admin-customers.html` – read real orders and registered customers.
- **Our Services** (`client-side/html/our-services.html`) reads the active services from the database, so whatever you add or hide in Admin > Services shows up there.
- Every admin action is checked on the server (`api/admin.php`); the page-guard is `client-side/js/admin-common.js`.

### Your own admin-dashboard.html (and any other admin page)
Replace its old `sessionStorage` guard script (the first `<script>` in `<head>`) with:

    <script src="client-side/js/api.js"></script>
    <script src="client-side/js/admin-common.js"></script>

and delete its old dropdown / log-out script (admin-common.js does that now).

### Order pages (customer side)
When a customer submits an order, call the backend:

    hqShop('create_order', { serviceId: 3, qty: 10, payment: 'GCash',
                             selections: [{ group: 'Size', option: 'A4' }], templateId: 12, notes: '' })

It returns `{ ok, orderId: 'HQ-1001', total }` and the order appears in Admin > Orders.
To show a service's templates and choices on its order page: `hqShop('service', undefined, { id: 3 })`.

## Ordering, payment, 3D preview (new)
- **One order page for every service:** `client-side/html/order.html?service=ID`. "Order Now" on Our Services opens it.
- **Options > Design > Details > Quantity & payment.** The preview updates live (flat, or 3D with *No fold* / *Two-fold* that opens).
- **Design source:** pick a template, OR leave templates unselected and type an AI prompt (it appears in the preview right away), OR upload your own PNG/JPG.
- **Info fields** (name, venue, date, message...) are set per service in Admin > Services > *Info Fields*. A service with no fields asks for nothing. For things like a 1x1 photo you can add one optional field and set *Where the info text goes* to "Caption below the design".
- **Preview type, 3D shapes, product size** are in Admin > Services > *Settings* (and in the Add Service form).
- **Payment:** PayMongo Checkout (GCash + PayMaya). Default is a 50% down payment (`DOWNPAYMENT_PERCENT` in config), or the customer can pay in full. The balance is collected on pickup/delivery; in Admin > Orders use "Mark balance as paid".

### Setup for payments
1. Create a PayMongo account, then Developers > API Keys. Put the **secret** key in `api/config.local.php` as `PAYMONGO_SECRET` (use `sk_test_...` while testing).
2. In PayMongo, make sure GCash and Maya are enabled for your account.
3. Open `database/setup.php` again (adds the new tables/columns).
4. On localhost the customer is verified when they come back to `order-complete.html`. For payments where the customer closes the browser early, add the webhook `api/paymongo-webhook.php` in PayMongo (needs a public URL).

### AI design prompt
Works without any key (built-in designer). For richer results put an Anthropic API key in `api/config.local.php` (`ANTHROPIC_API_KEY`). It designs colors, patterns, borders and fonts; it does not paint photo-style pictures.

## Cancel, refund, tracking, inquiries (new)
- **View Order** (`client-side/html/orders.html`): a customer's orders. *Cancel order* works only while the status is **Pending**. When the admin moves it to *In Design* (or any later step) it counts as "processing" and can't be cancelled any more.
- **Refund:** cancelling a paid order sends the amount paid (down payment or full) back through PayMongo. If PayMongo can't do it automatically, the order shows **REFUND NEEDED** in Admin > Orders: refund it in the PayMongo dashboard, then click "I refunded it myself" (or "Retry refund via PayMongo").
- **Track Order** (`track-order2.html`): the customer picks one of their own orders and sees the steps (Pending > In Design > Printing > Packing > Out for Delivery > Completed), payment summary and design.
- **Inquiries:** the Contact Us inquiry form (`contact-us3.html`) is saved to the database. Read them in Admin > Inquiries. The service list comes from Admin > Services.
- **Services that need no info:** Admin > Services > Settings > untick "Ask the customer to type info..." (e.g. Photo Print). The Info Fields tab then hides and the order page doesn't ask for anything.
- **Guests:** "Our Services" on the logged-out pages opens `our-services-guest.html`. "Order Now" asks them to log in, then continues to the order page.
- `admin-dashboard.html` is your own design, now showing real orders and payments.

## Portrait / landscape, preview background, keychain + magnet shapes (new)
- **Portrait / Landscape:** every product (except square ones like 1x1) has a Portrait/Landscape switch above the preview. The choice is saved with the order.
- **Preview background:** swatches + a colour picker under the preview, so a white card stays visible in 3D.
- **Shapes (Keychains, Ref Magnets):** the customer picks Circle, Triangle, Square, or "Follow my photo" (the background of the uploaded photo is removed, with a white sticker-style outline). Set which shapes a service offers, and whether it has a keyring hole, in Admin > Services > Settings > *Cut shapes*.
- **Background removal (rembg):** uses your Python + rembg (`tools/remove_bg.py`, path set by `REMBG_PYTHON` in `api/config.local.php`). The customer sees a quick preview at once, then the clean rembg cut-out a few seconds later. If rembg isn't available the built-in remover (best on plain backgrounds, with a slider) is used. A PNG that already has a transparent background is used as it is.
  - First time: open `database/setup.php?testrembg=1`, then `database/setup.php?warmrembg=1` once (downloads the model, needs internet; the model is stored in `tools/models`).
- The picture saved with the order (Admin > Orders) is a transparent PNG of the final shape.

## Front / Back and real-looking products (new)
- Every preview (flat or 3D) has a **Front / Back** switch. In 3D it turns the product around; in the flat preview it shows the back picture.
- **Product type** (Admin > Services > Settings, also in Add Service) decides how it looks:
  - *Fridge magnet*: thick, dark flexible-magnet back, glossy front.
  - *Keychain*: acrylic piece with a white backing, and a metal ring + chain through the keyring hole.
  - *Sticker*: thin vinyl, paper liner at the back.
  - *Photo paper print*: glossy front, white back with a faint watermark.
  - *Paper card*: the default (the two-fold card shows its outside back too).
- The 3D thickness of cut shapes (including "Follow my photo") is made from thin stacked layers, so it is an approximation of the real thickness.

## Landscape two-fold, My Profile, Settings (new)
- A **landscape** two-fold card is hinged at the top edge and opens **upward** (portrait cards still open sideways).
- **View Profile** (`client-side/html/profile.html`): the customer's details; name and phone can be edited (the email is used for verification codes, so it is read-only).
- **Settings** (`settings.html`): change password, and delete account (needs the password, and is blocked while orders are in progress).

## Show / hide password (new)
Every password box (Log In popup and page, Register, Settings, and the popup on all other pages) has an eye button. `client-side/js/password-toggle.js` adds it automatically. The Reset Password page keeps its own eye buttons.
