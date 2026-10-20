<?php
require __DIR__ . '/config.php';
require __DIR__ . '/lib.php';
require __DIR__ . '/paymongo.php';

$action = $_GET['action'] ?? '';
$in = input();

function need_customer() {
    if (($_SESSION['user']['role'] ?? '') !== 'customer') fail('Please log in first.', 401);
    return (int)$_SESSION['user']['id'];
}
function my_order($code, $uid) {
    $s = db()->prepare('SELECT * FROM orders WHERE order_code=? AND user_id=?'); $s->execute([$code, $uid]);
    $o = $s->fetch();
    if (!$o) fail('Order not found.', 404);
    return $o;
}
function order_full(array $o) {
    $d = json_list($o['details']);
    $paid = (float)$o['amount_paid'];
    return [
        'orderId' => $o['order_code'], 'service' => $o['service_name'], 'qty' => (int)$o['qty'], 'date' => substr($o['created_at'], 0, 10),
        'total' => (float)$o['total'], 'due' => (float)$o['amount_due'], 'paid' => $paid, 'balance' => max(0, round((float)$o['total'] - $paid, 2)),
        'payOption' => $o['pay_option'], 'paymentStatus' => $o['payment_status'], 'method' => $o['payment'], 'status' => $o['status'],
        'canCancel' => $o['status'] === 'pending',
        'fulfillment' => $o['fulfillment'], 'deliveryFee' => (float)$o['delivery_fee'], 'deliveryStatus' => $o['delivery_status'],
        // the delivery fee only shows up to the customer once the order is packing / out for delivery
        'deliveryDue' => $o['fulfillment'] === 'delivery' && (float)$o['delivery_fee'] > 0 && $o['delivery_status'] === 'unpaid' && in_array($o['status'], ['packing', 'out-for-delivery'], true),
        'deliveryAddress' => $d['delivery']['address'] ?? '', 'deliveryLandmark' => $d['delivery']['landmark'] ?? '', 'contactPhone' => $d['contactPhone'] ?? '', 'lalamoveRef' => $o['lalamove_ref'],
        'refundStatus' => $o['refund_status'], 'refundAmount' => (float)$o['refund_amount'],
        'designImage' => $o['design_image'], 'shape' => $d['shape'] ?? 'no-fold', 'info' => $d['info'] ?? [],
        'designSource' => $d['design']['source'] ?? 'none', 'notes' => $d['notes'] ?? '',
    ];
}
function order_summary(array $o) {
    return ['orderId' => $o['order_code'], 'service' => $o['service_name'], 'qty' => (int)$o['qty'],
            'total' => (float)$o['total'], 'due' => (float)$o['amount_due'], 'paid' => (float)$o['amount_paid'],
            'balance' => max(0, round((float)$o['total'] - (float)$o['amount_paid'], 2)),
            'paymentStatus' => $o['payment_status'], 'payOption' => $o['pay_option'], 'method' => $o['payment'], 'status' => $o['status'],
            'deliveryFee' => (float)$o['delivery_fee'], 'deliveryStatus' => $o['delivery_status']];
}

try {
    switch ($action) {

    // Active services shown on the website
    case 'services':
        $rows = db()->query('SELECT s.*, (SELECT COUNT(*) FROM templates t WHERE t.service_id = s.id) AS template_count
                             FROM services s WHERE s.is_active=1 ORDER BY s.sort_order, s.id')->fetchAll();
        out(['ok' => true, 'services' => array_map(function ($r) { return service_out($r); }, $rows)]);

    // One service with everything the order page needs
    case 'service':
        $s = db()->prepare('SELECT * FROM services WHERE id=? AND is_active=1'); $s->execute([(int)($_GET['id'] ?? 0)]);
        $r = $s->fetch();
        if (!$r) fail('Service not found.', 404);
        $svc = service_out($r, true);
        $svc['templates'] = [];
        if ($svc['needsTemplate']) {
            $t = db()->prepare('SELECT id, occasion, file_path, original_name FROM templates WHERE service_id=? ORDER BY occasion, id');
            $t->execute([$svc['id']]);
            foreach ($t->fetchAll() as $x) $svc['templates'][] = ['id' => (int)$x['id'], 'occasion' => $x['occasion'], 'file' => $x['file_path'], 'name' => $x['original_name']];
        }
        $svc['downpaymentPercent'] = (int)DOWNPAYMENT_PERCENT;
        $svc['removeBgAvailable'] = rembg_ready();
        out(['ok' => true, 'service' => $svc]);

    // Customer uploads their own design
    case 'upload_design':
        need_customer();
        if (empty($_FILES['design'])) fail('Please choose a file.');
        try { $f = save_upload($_FILES['design'], 'designs', ['png', 'jpg', 'jpeg'], 10 * 1048576); }
        catch (RuntimeException $e) { fail($e->getMessage()); }
        out(['ok' => true, 'path' => $f[0]]);

    // Place an order, then send the customer to PayMongo (GCash / PayMaya)
    case 'create_order':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);
        $uid = need_customer();

        $s = db()->prepare('SELECT * FROM services WHERE id=? AND is_active=1'); $s->execute([(int)($in['serviceId'] ?? 0)]);
        $svc = $s->fetch();
        if (!$svc) fail('That service is not available.', 404);
        $qty = (int)($in['qty'] ?? 1);
        if ($qty < 1 || $qty > 100000) fail('Please enter a valid quantity.');
        $payOption = (($in['payOption'] ?? 'down') === 'full') ? 'full' : 'down';
        $shapes = json_list($svc['shapes']) ?: ['no-fold'];
        $shape = in_array($in['shape'] ?? '', $shapes, true) ? $in['shape'] : $shapes[0];

        // price: from the service's price table (e.g. A4 + black & white = 2.00) or its base price, plus other chosen options.
        // Always worked out here on the server, never trusted from the browser.
        $groups = json_list($svc['choices']);
        $matrix = json_list($svc['price_matrix'] ?? '[]');
        $mGroups = is_array($matrix['groups'] ?? null) ? $matrix['groups'] : [];
        $unit = 0.0; $picked = []; $pickedIds = [];
        foreach ((is_array($in['selections'] ?? null) ? $in['selections'] : []) as $sel) {
            foreach ($groups as $g) {
                if ($g['name'] !== ($sel['group'] ?? null)) continue;
                foreach ($g['options'] as $o) if ($o['name'] === ($sel['option'] ?? null)) {
                    $inMatrix = in_array($g['id'] ?? '', $mGroups, true);
                    if (!$inMatrix) $unit += (float)$o['price'];
                    $picked[] = ['group' => $g['name'], 'option' => $o['name'], 'price' => $inMatrix ? 0 : $o['price']];
                    $pickedIds[$g['id'] ?? ''] = $o['id'] ?? '';
                }
            }
        }
        foreach ($groups as $g) {
            if (empty($g['required']) && !in_array($g['id'] ?? '', $mGroups, true)) continue;
            $has = false; foreach ($picked as $p) if ($p['group'] === $g['name']) $has = true;
            if (!$has) fail('Please choose: ' . $g['name']);
        }
        if ($mGroups) {
            $key = implode('|', array_map(function ($gid) use ($pickedIds) { return $pickedIds[$gid] ?? ''; }, $mGroups));
            $mp = (float)($matrix['prices'][$key] ?? 0);
            if ($mp <= 0) fail('The price for this choice is not set yet. Please pick another option, or contact us.');
            $unit += $mp;
        } else {
            $unit += preg_match('/\d+(\.\d+)?/', $svc['price_text'], $bm) ? (float)$bm[0] : 0.0;
        }

        // the info the customer typed in (name, address, date ...)
        $infoRows = [];
        $vals = is_array($in['info'] ?? null) ? $in['info'] : [];
        foreach (empty($svc['needs_info']) ? [] : json_list($svc['info_fields']) as $f) {
            $v = clean_text($vals[$f['key']] ?? '', 500);
            if (!empty($f['required']) && $v === '') fail('Please fill in: ' . $f['label']);
            if ($v !== '') $infoRows[] = ['label' => $f['label'], 'value' => $v];
        }

        // the design: a template, their own upload, an AI prompt, or nothing
        $d = is_array($in['design'] ?? null) ? $in['design'] : [];
        $design = ['source' => 'none'];
        $source = $d['source'] ?? 'none';
        if ($source === 'template') {
            $t = db()->prepare('SELECT id, file_path FROM templates WHERE id=? AND service_id=?'); $t->execute([(int)($d['templateId'] ?? 0), $svc['id']]);
            if ($row = $t->fetch()) $design = ['source' => 'template', 'templateId' => (int)$row['id'], 'file' => $row['file_path']];
        } elseif ($source === 'upload') {
            $path = (string)($d['path'] ?? '');
            if (preg_match('#^uploads/designs/[a-f0-9]{20}\.(png|jpg|jpeg)$#', $path) && is_file(__DIR__ . '/../' . $path)) $design = ['source' => 'upload', 'file' => $path];
        } elseif ($source === 'ai') {
            $spec = clean_spec($d['spec'] ?? null);
            if ($spec) $design = ['source' => 'ai', 'prompt' => clean_text($d['prompt'] ?? '', 300), 'spec' => $spec];
        }
        // contact number for EVERY order (so we can reach the customer, and the Lalamove rider can call).
        // Pickup at the shop, or delivery by Lalamove: delivery also needs the receiver, home address and a landmark.
        // The delivery fee is NOT part of this payment; it is added later when the order is packing.
        $contactPhone = normalize_phone($in['contactPhone'] ?? '');
        if (!preg_match('/^09\d{9}$/', $contactPhone)) fail('Please enter your mobile number (09XX XXX XXXX) so we can reach you.');
        $fulfillment = (($in['fulfillment'] ?? 'pickup') === 'delivery') ? 'delivery' : 'pickup';
        $delivery = null;
        if ($fulfillment === 'delivery') {
            $dv = is_array($in['delivery'] ?? null) ? $in['delivery'] : [];
            $dn = clean_text($dv['name'] ?? '', 80); $da = clean_text($dv['address'] ?? '', 300); $dl = clean_text($dv['landmark'] ?? '', 150);
            if ($dn === '') fail('Please enter the name of the person receiving the order.');
            if (mb_strlen($da) < 10) fail('Please enter your complete home address.');
            if (mb_strlen($dl) < 3) fail('Please enter a landmark near your address (it helps the rider find you).');
            $delivery = ['name' => $dn, 'phone' => $contactPhone, 'address' => $da, 'landmark' => $dl];
        }
        $orientation = in_array($in['orientation'] ?? '', ['portrait', 'landscape'], true) ? $in['orientation'] : 'portrait';
        $cuts = clean_cut_shapes(json_list($svc['cut_shapes']));
        $cutShape = null;
        if ($cuts) {   // keychains / magnets: a shape is needed, and "photo" needs the customer's own photo
            $cutShape = in_array($in['cutShape'] ?? '', $cuts, true) ? $in['cutShape'] : $cuts[0];
            if ($design['source'] === 'none') fail('Please upload your photo or choose a design.');
            if ($cutShape === 'photo' && $design['source'] !== 'upload') fail('Please upload your photo so we can remove its background.');
        }
        if ($svc['needs_template'] && $design['source'] === 'none') fail('Please choose a template, describe a design, or upload your own.');

        $totalCents = (int)round($unit * $qty * 100);
        if ($totalCents <= 0) fail('This service has no price yet. Please contact us to order.');
        $dueCents = $payOption === 'full' ? $totalCents : (int)ceil($totalCents * DOWNPAYMENT_PERCENT / 100);
        if ($dueCents < 2000) fail('The amount to pay online must be at least ' . "\u{20B1}" . '20. Please increase the quantity.');

        $details = ['selections' => $picked, 'shape' => $shape, 'orientation' => $orientation, 'cutShape' => $cutShape, 'contactPhone' => $contactPhone, 'unitPrice' => round($unit, 2), 'delivery' => $delivery, 'info' => $infoRows, 'design' => $design, 'notes' => clean_text($in['notes'] ?? '', 500)];
        db()->prepare("INSERT INTO orders (user_id,service_id,service_name,qty,total,payment,details,payment_status,pay_option,amount_due,fulfillment) VALUES (?,?,?,?,?,'PayMongo',?, 'unpaid',?,?,?)")
            ->execute([$uid, $svc['id'], $svc['name'], $qty, $totalCents / 100, json_encode($details), $payOption, $dueCents / 100, $fulfillment]);
        $id = (int)db()->lastInsertId();
        $code = 'HQ-' . (1000 + $id);
        db()->prepare('UPDATE orders SET order_code=? WHERE id=?')->execute([$code, $id]);

        // snapshot of what the customer designed (so the admin can print it)
        $png = (string)($in['previewPng'] ?? '');
        if (strpos($png, 'data:image/png;base64,') === 0) {
            $bin = base64_decode(substr($png, 22), true);
            if ($bin !== false && strlen($bin) < 6 * 1048576 && substr($bin, 0, 8) === "\x89PNG\r\n\x1a\n" && @getimagesizefromstring($bin)) {
                $rel = 'uploads/designs/order-' . $id . '.png';
                if (is_dir(__DIR__ . '/../uploads/designs') || mkdir(__DIR__ . '/../uploads/designs', 0775, true)) {
                    file_put_contents(__DIR__ . '/../' . $rel, $bin);
                    db()->prepare('UPDATE orders SET design_image=? WHERE id=?')->execute([$rel, $id]);
                }
            }
        }

        try {
            $co = paymongo_checkout($code, $svc['name'], $dueCents, $payOption);
            db()->prepare('UPDATE orders SET checkout_session=? WHERE id=?')->execute([$co['id'], $id]);
        } catch (RuntimeException $e) {
            delete_file('uploads/designs/order-' . $id . '.png');
            db()->prepare('DELETE FROM orders WHERE id=?')->execute([$id]);   // don't leave an unpaid ghost order
            fail('We could not start the payment. ' . $e->getMessage(), 502);
        }
        out(['ok' => true, 'orderId' => $code, 'checkoutUrl' => $co['url'], 'due' => $dueCents / 100, 'total' => $totalCents / 100]);

    // The logged-in customer's own orders (for View Order and Track Order)
    case 'my_orders':
        $uid = need_customer();
        $q = db()->prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 60'); $q->execute([$uid]);
        $rows = $q->fetchAll(); $checked = 0; $list = [];
        foreach ($rows as $o) {
            if ($o['payment_status'] === 'unpaid' && $o['status'] === 'pending' && $o['checkout_session'] && PAYMONGO_SECRET !== '' && $checked < 3) {
                $checked++; try { $o = sync_payment($o); } catch (RuntimeException $e) { error_log($e->getMessage()); }
            }
            if ($o['delivery_status'] === 'unpaid' && $o['delivery_session'] && PAYMONGO_SECRET !== '' && $checked < 3) {
                $checked++; try { $o = sync_delivery($o); } catch (RuntimeException $e) { error_log($e->getMessage()); }
            }
            $list[] = order_full($o);
        }
        out(['ok' => true, 'orders' => $list]);

    // Cancel: only while the order is still Pending. Paid orders are refunded.
    case 'cancel_order':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);
        $uid = need_customer();
        $o = my_order((string)($in['orderId'] ?? ''), $uid);
        try { $o = sync_payment($o); } catch (RuntimeException $e) { error_log($e->getMessage()); }   // don't lose a payment made a moment ago
        if ($o['status'] === 'cancelled') fail('This order is already cancelled.');
        if ($o['status'] !== 'pending') fail('This order is already being processed, so it can no longer be cancelled. Please contact us.');
        $u = db()->prepare("UPDATE orders SET status='cancelled' WHERE id=? AND status='pending'");
        $u->execute([$o['id']]);
        if (!$u->rowCount()) fail('This order is already being processed, so it can no longer be cancelled. Please contact us.');
        $s2 = db()->prepare('SELECT * FROM orders WHERE id=?'); $s2->execute([$o['id']]); $o = $s2->fetch();
        if ((float)$o['amount_paid'] > 0) { apply_refund($o, refund_order($o)); $s2->execute([$o['id']]); $o = $s2->fetch(); }
        out(['ok' => true, 'order' => order_full($o)]);

    // An inquiry from the Contact Us form (saved so the admin can see it)
    case 'inquiry':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);
        $uid = need_customer();
        $c = db()->prepare('SELECT COUNT(*) FROM inquiries WHERE user_id=? AND created_at > (NOW() - INTERVAL 1 HOUR)'); $c->execute([$uid]);
        if ($c->fetchColumn() >= 10) fail('You have sent many inquiries. Please wait a while.', 429);
        $name = clean_text($_POST['name'] ?? '', 80); $contact = clean_text($_POST['contact'] ?? '', 80); $service = clean_text($_POST['service'] ?? '', 80);
        if ($name === '' || $contact === '' || $service === '') fail('Please fill in your name, contact and the service.');
        $qty = max(1, min(100000, (int)($_POST['qty'] ?? 1)));
        $files = [];
        if (!empty($_FILES['files']) && is_array($_FILES['files']['name'])) {
            $n = min(5, count($_FILES['files']['name']));
            for ($i = 0; $i < $n; $i++) {
                if (($_FILES['files']['error'][$i] ?? 4) === UPLOAD_ERR_NO_FILE) continue;
                try {
                    $f = save_upload(['name' => $_FILES['files']['name'][$i], 'tmp_name' => $_FILES['files']['tmp_name'][$i], 'size' => $_FILES['files']['size'][$i], 'error' => $_FILES['files']['error'][$i]], 'inquiries', ['png', 'jpg', 'jpeg', 'pdf'], 10 * 1048576);
                    $files[] = ['path' => $f[0], 'name' => $f[1]];
                } catch (RuntimeException $e) { fail($e->getMessage()); }
            }
        }
        db()->prepare('INSERT INTO inquiries (user_id,name,contact,service_name,qty,details,files) VALUES (?,?,?,?,?,?,?)')
            ->execute([$uid, $name, $contact, $service, $qty, clean_text($_POST['details'] ?? '', 3000), json_encode($files)]);
        out(['ok' => true]);

    // Removes the background of the customer's uploaded photo with rembg (Python on this computer)
    case 'remove_bg':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);
        need_customer();
        if (!rembg_ready()) fail('The background remover is not set up.', 501);
        $now = time();
        $_SESSION['rb_calls'] = array_values(array_filter($_SESSION['rb_calls'] ?? [], function ($t) use ($now) { return $t > $now - 3600; }));
        if (count($_SESSION['rb_calls']) >= 20) fail('Too many background removals. Try again in a while.', 429);
        $path = (string)($in['path'] ?? '');
        if (!preg_match('#^uploads/designs/[a-f0-9]{20}\.(png|jpg|jpeg)$#', $path) || !is_file(__DIR__ . '/../' . $path)) fail('Please upload your photo first.');
        $_SESSION['rb_calls'][] = $now;
        $rel = 'uploads/designs/' . bin2hex(random_bytes(10)) . '.png';
        list($code, $log) = rembg_run(realpath(__DIR__ . '/../' . $path), realpath(__DIR__ . '/../uploads/designs') . DIRECTORY_SEPARATOR . basename($rel));
        if ($code !== 0 || !is_file(__DIR__ . '/../' . $rel)) { error_log('rembg failed: ' . $log); fail('Could not remove the background. Using the built-in remover instead.', 502); }
        out(['ok' => true, 'path' => $rel]);

    // Customer came back from PayMongo: check if it was really paid
    case 'verify_payment':
        $uid = need_customer();
        $o = my_order((string)($in['orderId'] ?? ''), $uid);
        try { $o = sync_payment($o); } catch (RuntimeException $e) { error_log($e->getMessage()); }
        try { $o = sync_delivery($o); } catch (RuntimeException $e) { error_log($e->getMessage()); }
        out(['ok' => true, 'order' => order_summary($o)]);

    // Pay the Lalamove delivery fee (only once the order is packing / out for delivery)
    case 'pay_delivery':
        $uid = need_customer();
        $o = my_order((string)($in['orderId'] ?? ''), $uid);
        if ($o['fulfillment'] !== 'delivery' || $o['delivery_status'] !== 'unpaid' || (float)$o['delivery_fee'] <= 0 || !in_array($o['status'], ['packing', 'out-for-delivery'], true)) fail('There is no delivery fee to pay right now.');
        try { $co = paymongo_delivery_checkout($o['order_code'], (int)round($o['delivery_fee'] * 100)); }
        catch (RuntimeException $e) { fail('We could not start the payment. ' . $e->getMessage(), 502); }
        db()->prepare('UPDATE orders SET delivery_session=? WHERE id=?')->execute([$co['id'], $o['id']]);
        out(['ok' => true, 'checkoutUrl' => $co['url']]);

    // Retry paying an order that is still unpaid
    case 'pay_order':
        $uid = need_customer();
        $o = my_order((string)($in['orderId'] ?? ''), $uid);
        if ($o['payment_status'] !== 'unpaid') fail('This order is already paid.');
        try {
            $co = paymongo_checkout($o['order_code'], $o['service_name'], (int)round($o['amount_due'] * 100), $o['pay_option']);
        } catch (RuntimeException $e) { fail('We could not start the payment. ' . $e->getMessage(), 502); }
        db()->prepare('UPDATE orders SET checkout_session=? WHERE id=?')->execute([$co['id'], $o['id']]);
        out(['ok' => true, 'checkoutUrl' => $co['url']]);

    default:
        fail('Unknown action.', 404);
    }
} catch (PDOException $e) {
    error_log($e->getMessage());
    fail('Database error. Did you run database/setup.php after updating?', 500);
} catch (Throwable $e) {
    error_log($e->getMessage());
    fail('Server error.', 500);
}
