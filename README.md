# Happy Queen's Crafty House

PHP + MySQL (XAMPP / phpMyAdmin). Put this folder in `C:\xampp\htdocs\HappyQueens`.

## Setup
1. XAMPP Control Panel → start **Apache** and **MySQL**.
2. Open http://localhost/HappyQueens/database/setup.php  (creates the DB, tables, admin and the starter services). Run it again after every update of this project; it only adds what's missing. Delete that file when done.
3. Open `api/config.local.php` and fill in your Gmail details (see comments inside).
4. Test sending: http://localhost/HappyQueens/database/setup.php?testmail=youremail@gmail.com
5. Open http://localhost/HappyQueens/  (never double-click the .html files). It opens the visitor home page.

Admin login: admin@happyqueens.com / Admin@123 (change it).

## Folders
- `api/` – backend (auth.php = all actions, delivery.php = email/SMS sending, config*.php)
- `database/` – setup.php, happyqueens.sql (optional manual import), create-admin.php
- `client-side/` – the website (see Folders below)
- `images/` – put `right side.png` here

## Protect admin-dashboard.html
Add to the page: `<script src="client-side/js/api.js"></script>` and
`hqApi('me').then(r => { if (!r.ok || r.user.role !== 'admin') location.replace('client-side/html/index.html'); });`

## Admin panel (connected to MySQL)
- `admin-services.html` – add / edit / hide / delete services, photos, occasions, choices, "needs a template".
- `template-page.html` – one folder per service that needs a template; uploads are stored in `uploads/templates/`.
- `admin-orders.html`, `admin-customers.html` – read real orders and registered customers.
- **Our Services** (`client-side/with-account/our-services.html`) reads the active services from the database, so whatever you add or hide in Admin > Services shows up there.
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
- **One order page for every service:** `client-side/with-account/order.html?service=ID`. "Order Now" on Our Services opens it.
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
- **View Order** (`client-side/with-account/orders.html`): a customer's orders. *Cancel order* works only while the status is **Pending**. When the admin moves it to *In Design* (or any later step) it counts as "processing" and can't be cancelled any more.
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
- **View Profile** (`client-side/with-account/profile.html`): the customer's details; name and phone can be edited (the email is used for verification codes, so it is read-only).
- **Settings** (`settings.html`): change password, and delete account (needs the password, and is blocked while orders are in progress).

## Show / hide password (new)
Every password box (Log In popup and page, Register, Settings, and the popup on all other pages) has an eye button. `client-side/js/password-toggle.js` adds it automatically. The Reset Password page keeps its own eye buttons.

## Delivery by Lalamove, paid separately (new)
- On the order page the customer chooses **Pick up at the shop** or **Deliver via Lalamove** (receiver's name, mobile, full address). The down payment / full payment is for the **product only**.
- When the order is **Packing** (or Out for Delivery), open it in Admin > Orders and enter the **Lalamove delivery fee** from the Lalamove app (+ optional booking link) > *Request delivery payment*. The customer then sees "Pay delivery fee" in View Order / Track Order (and gets an email if email is set up) and pays it through PayMongo (GCash / PayMaya).
- A delivery order can't be set to **Out for Delivery** until the fee is paid (use *Mark delivery fee as paid* if it was paid in cash). The fee is never counted in your revenue.

## Required customer info + price tables (new)
- **Every order needs a mobile number.** Delivery orders also need the receiver's name, complete home address and a landmark (so the Lalamove rider can find the place). These are saved in My Profile and pre-filled next time. Admin > Orders shows them.
- **Price table** (Admin > Services > a service > *Choices* > *Price table*): tick the option groups that decide the price (e.g. *Paper size* + *Print color*) and type a price for each combination (A4 + Black & white = 2, A4 + Colored = 3, ...). Customers see the table on the order page and the total updates as they choose. The Our Services card shows "From P2 / page".
- **Price unit** (Settings): "page", "pc", "set"... shown as "per page".
- Documents is set up with sample prices the first time; edit them in the admin.

## Folders (new)
```
HappyQueens/
  api/                         backend (PHP)
  database/                    setup.php, SQL
  uploads/  tools/  images/
  admin/                       ALL admin pages + admin.css + template-page.*
  client-side/
    without-account/           pages for visitors who are NOT logged in
                               index, login, register, verify-*, forgot/reset-password,
                               our-services (Order Now asks them to log in), track-order (explains tracking)
    with-account/              pages for logged-in customers
                               homepage, about-us2, contact-us2, contact-us3, our-services, order, order-complete,
                               orders (View Order), track-order2, profile, settings
    css/  js/                  shared by both
```
- **Your own pages that were not uploaded** (`about-us.html`, `contact-us.html`) go in `client-side/without-account/`. Their CSS (`about-us.css`, `contact-us.css`, `about-us2.css`, `contact-us2.css`, `contact-us3.css`) and `images/right side.png` stay where you keep them.
- Admin login opens `admin/admin-dashboard.html`. Logging out sends everyone back to `without-account/index.html`.

## Track Order (new look)
- **Logged in** (`track-order2.html`): pick an order, see a clear progress bar with what each status means, then Payment, Delivery/Pickup, Order details and the design (front + back).
- **Not logged in** (`without-account/track-order.html`): explains what Track Order shows, what each status means, the payment words (down payment, balance, delivery fee), cancel + refund rules, FAQ, and a Log In button.

## AI design now includes the back (new)
- The AI (or the built-in designer) now makes the **front and the back** as one set (the back has a matching thank-you line), plus a message for the inside of a two-fold card. The back is shown with the Front / Back switch, and is saved with the order (Admin > Orders shows "Design back").
- The AI key goes in `api/config.local.php`: `OPENAI_API_KEY` (an OpenAI key) or `ANTHROPIC_API_KEY`. Test it with `database/setup.php?testai=1`.

## Documents, photos, AI picture editing, sizes (new)
- **Documents:** the customer uploads a **PDF or Word** file (no templates, no design). A PDF shows its first page on a sheet of the chosen **paper size**; changing A4 / Short / Long changes the sheet (bigger or smaller), and **Black & white** shows the page in grayscale. Page count is read from the PDF (for Word files the customer types it).
- **ID photo, Instax, Photo print, Photo strips:** upload photos > choose size > choose package > copies. The preview shows the real size (a 2R is drawn smaller than an 8R). Instax shows a white frame; a photo strip shows 4 photos in a white border (dark background by default).
- **Stickers, Ref magnets, Keychains, ID photo:** after uploading a picture, the AI prompt **edits the picture** (Tagalog or English). *Undo AI edit* goes back to the original. Keychains print the picture on **both sides** (back to back).
- **Admin > Services:** in *Choices*, set a group's role to **Size** (type width x height of each option) or **Print color** (tick "B&W" for black and white). *Settings* has: what the customer uploads, what the AI does (make a design / edit the picture), the photo frame, and back-to-back.
- **Packages** (ID photo, Instax) are normal options; use the *Note* box to say what each package includes, and the **Price table** (size x package) for prices. **You must fill in these prices** before customers can order those services.
- The inside of a folded invitation now uses the same colors as the front. Text on a template/photo no longer has a white box: it turns white or dark automatically so it stays readable.
- AI picture editing uses `OPENAI_API_KEY` (model in `OPENAI_IMAGE_MODEL`, default `gpt-image-1`); it can cost more per picture than text. Official IDs and passports usually need an unedited photo: tell customers not to AI-edit photos for official documents.

## Full screen, text styles, inside vs outside (new)
- **Full screen:** the preview card has a **Full screen** button (flat or 3D, with Front / Back / Inside, Open card, orientation...). Press Esc or "Exit full screen" to leave.
- **Every text can be styled:** under each detail the customer types (name, date, venue, message...), there is a **font** list (18 fonts) and a **size** slider (50% to 200%). It shows in the preview at once and is saved with the order (Admin > Orders shows the font and size).
- **Inside vs outside:** in Admin > Services > *Info Fields*, every text has "Printed on the front / inside (folded card) / back". On a two-fold card the inside has its own text, shown with the **Inside** button (it opens the card). On a card with no fold, the inside text is printed on the front. Invitation cards start with the venue + message inside.
- **One design for every side:** whatever design the customer uses (a template, an uploaded design, or the AI suggestion) is used for the front AND the back, and for both inside pages of a folded card. The text only changes per side (front / inside / back text).
- Admin > Orders shows the front, back and inside pictures, and any design files the customer uploaded.

## Admin: view the customer's product + print (new)
- In Admin > Orders open an order > **View product / Print**. It opens `admin/order-view.html`: the customer's product in **full screen**, in **3D** when the service has a 3D preview (drag to turn it, Front / Back / Inside, Open card), or as flat pictures when it doesn't.
- **Print** prints the real artwork (front, back, inside) from the saved pictures, at the **actual size** of the size the customer chose (or fit to the page). For uploaded documents the page gives the file to download and print from your PDF / Word program; for photo orders it prints each photo.

## Back + inside match the template; a folded card prints as ONE sheet (new)
- **Matching color:** when the front is a template or an uploaded design, the back and the inside take the **main color** of that design (a blue template with flowers gives a blue back and inside), with the design itself very softly in the background and a border in its second color. Under the design options the customer can switch to **"Same picture as the front"**. AI designs already keep the same colors on every side.
- **Print a two-fold card on ONE sheet** (Admin > Orders > View product / Print): page 1 = the **outside**, with the back and the front together (back | front for a portrait card; back upside-down on top and front below for a landscape card, so it reads upright after folding). Page 2 = the **inside** (both pages), printed on the back of the same sheet. The **Print layout** button in the viewer shows these sheets before you print. Cards with no fold print the front and the back as normal pages.

## Move / zoom the picture (new)
- After uploading a picture, the customer taps **Move / zoom picture** (in the preview toolbar and next to the upload). The editor shows the whole picture softly, and the part that will be printed brightly, inside the real frame: a 1x1 / 2x2 / passport / photo size, an Instax window, one slot of a photo strip, or a **circle / triangle / heart / square** magnet or keychain. **Drag** to move, **scroll / pinch / slider** to zoom in or out (zooming out leaves white around the picture), **Reset** goes back.
- Every photo has its own position (pick a photo, then move it). The preview and the saved pictures use the same crop. For ID / Instax / photo print orders the admin viewer and **Print** draw each photo with the customer's crop, at the chosen size.
- An ID photo without a caption no longer keeps a white strip at the bottom, so the whole 1x1 is the photo.
- "Follow my photo" (background removed) is not cropped, because its shape is the person.

## About Us + Contact Us pages (redesigned)
- New shared stylesheet `client-side/css/pages.css`. Pages: **with-account** `about-us2.html`, `contact-us2.html` (shop info, map, quick answers) and `contact-us3.html` (inquiry form); **without-account** `about-us.html`, `contact-us.html` and `contact-us3.html` (the same pages for visitors; the navigation already points to them).
- The inquiry form lists the shop's services, and shows that service's options (size, color...) as dropdowns. **Visitors can send inquiries too** (no file attachments, a hidden spam field, and a limit of 4 per hour per connection); logged-in customers get their details filled in and can attach up to 5 files. Admin > Inquiries shows the email and marks visitors.
- The footer phone number placeholder (0900 000 0000) was replaced with the shop number 0996 533 2418 on all pages. Open `database/setup.php` once to add the `email` and `ip` columns to the inquiries table.

## Logo + no hover movement
- The new logo is on **every navigation bar** (website, login/register pages and the admin sidebar). Each one loads `images/logo.png` first and falls back to the Facebook link. **Save your logo as `images/logo.png`** so it never breaks: Facebook image links expire (the one in use stops working around 6 Nov 2026).
- Cards, buttons and services no longer move or zoom when the mouse is on them (colors and shadows still change a little). To bring a movement back, put `transform` back inside that rule's `:hover` block in the CSS.

## Print = only the product
- **Print** now prints only the artwork: no label above it, and no shop name on the back of cards. The page margin is set to 0 so the browser does not add its own date / address header and footer. (Orders saved before this update still have the shop name on the back picture.)

## Pay the balance in View Order + COD delivery fee
- There is **no extra stage**: Pending > In Design > Printing > Packing > Out for Delivery > Completed. From **Packing** on, **View Order** shows a **Pay balance** button (GCash / PayMaya) and a **reminder** that a delivery order will not go out until the balance is paid. Track Order shows the same reminder (the button is only in View Order), and the customer gets an email when you move the order to Packing.
- A delivery order **cannot be moved to Out for Delivery** until the balance is paid (the customer pays online, or you tap **Mark balance as paid** for cash). Pickup orders are not blocked (the balance can be paid at the shop).
- The **Lalamove delivery fee is cash on delivery**: the customer pays the rider, nothing is collected online. In Admin > Orders open the order > **Lalamove delivery fee** and type the amount (needed before "Out for Delivery"). The customer sees it from Packing on.
- Open `database/setup.php` once to add the new columns. Old "unpaid" delivery fees become COD.

## Details on every service
- **Every service now has "Details on your design"**, including **Documents, Photo Print, ID Photo, Instax and Photo Strips**: a **Caption** the customer can type, with the font list and size slider. Open `database/setup.php` once to switch it on (services that already had their own fields keep them). You can rename, add or remove fields in Admin > Services > Info Fields.
- On photos, the caption is printed in a **white strip under the picture**; the strip only appears when a caption is typed, so with no caption the photo fills the whole size (a 1x1 ID photo stays 1x1). On Instax it is printed on the white bottom. On **Documents** the caption is shown small at the bottom margin of the preview and is saved with the order for you to read; **the customer's PDF / Word file is printed as it was uploaded** (the caption is not added to the file).
- Admin > Orders > View product / Print prints photos with their caption.
