<?php
require __DIR__ . '/config.php';
require __DIR__ . '/lib.php';
require __DIR__ . '/paymongo.php';

// Every action here is admin-only, checked on the server.
if (($_SESSION['user']['role'] ?? '') !== 'admin') fail('Admin access only.', 403);

$action = $_GET['action'] ?? '';
$readOnly = ['services', 'templates', 'customers', 'orders', 'dashboard', 'inquiries'];
if ($_SERVER['REQUEST_METHOD'] !== 'POST' && !in_array($action, $readOnly, true)) fail('Method not allowed', 405);
$in = input();
const ORDER_STATUSES = ['pending', 'in-design', 'printing', 'packing', 'out-for-delivery', 'completed', 'cancelled'];

try {
    switch ($action) {

    // ---------------- Services ----------------
    case 'services':
        $rows = db()->query('SELECT s.*, (SELECT COUNT(*) FROM templates t WHERE t.service_id = s.id) AS template_count
                             FROM services s ORDER BY s.sort_order, s.id')->fetchAll();
        out(['ok' => true, 'services' => array_map(function ($r) { return service_out($r, true); }, $rows)]);

    case 'service_save':
        $id   = (int)($in['id'] ?? 0);
        $name = clean_text($in['name'] ?? '', 80);
        if ($name === '') fail('Please enter a service name.');
        $set = [
            'name'           => $name,
            'description'    => clean_text($in['description'] ?? '', 160),
            'price_text'     => clean_text($in['priceText'] ?? '', 40),
            'order_url'      => safe_url($in['orderUrl'] ?? ''),
            'needs_template' => !empty($in['needsTemplate']) ? 1 : 0,
            'is_active'      => array_key_exists('isActive', $in) ? (!empty($in['isActive']) ? 1 : 0) : 1,
            'occasions'      => json_encode(clean_occasions($in['occasions'] ?? [])),
            'preview_mode'   => (($in['previewMode'] ?? 'flat') === '3d') ? '3d' : 'flat',
            'shapes'         => json_encode(clean_shapes($in['shapes'] ?? ['no-fold'])),
            'ratio_w'        => clean_ratio($in['ratioW'] ?? 5, 5),
            'ratio_h'        => clean_ratio($in['ratioH'] ?? 7, 7),
            'text_position'  => (($in['textPosition'] ?? 'center') === 'bottom') ? 'bottom' : 'center',
            'ai_enabled'     => array_key_exists('aiEnabled', $in) ? (!empty($in['aiEnabled']) ? 1 : 0) : 1,
            'cut_shapes'     => json_encode(clean_cut_shapes($in['cutShapes'] ?? [])),
            'cut_hole'       => !empty($in['cutHole']) ? 1 : 0,
            'product_type'   => pick($in['productType'] ?? 'paper', ['paper', 'photo', 'sticker', 'magnet', 'keychain'], 'paper'),
            'needs_info'     => array_key_exists('needsInfo', $in) ? (!empty($in['needsInfo']) ? 1 : 0) : 1,
            'upload_enabled' => array_key_exists('uploadEnabled', $in) ? (!empty($in['uploadEnabled']) ? 1 : 0) : 1,
        ];
        $set['unit_label'] = clean_text($in['unitLabel'] ?? 'pc', 20) ?: 'pc';
        if (array_key_exists('choices', $in)) {
            $cleanChoices = clean_choices($in['choices']);
            $set['choices'] = json_encode($cleanChoices);
            if (array_key_exists('priceMatrix', $in)) $set['price_matrix'] = json_encode(clean_price_matrix($in['priceMatrix'], $cleanChoices));
        }
        if (array_key_exists('infoFields', $in)) $set['info_fields'] = json_encode(clean_info_fields($in['infoFields']));

        if ($id) {
            $sql = 'UPDATE services SET ' . implode(', ', array_map(function ($k) { return $k . '=?'; }, array_keys($set))) . ' WHERE id=?';
            $vals = array_values($set); $vals[] = $id;
            db()->prepare($sql)->execute($vals);
        } else {
            $set['sort_order'] = (int)db()->query('SELECT COALESCE(MAX(sort_order),0)+1 FROM services')->fetchColumn();
            if (!isset($set['choices'])) $set['choices'] = '[]';
            if (!isset($set['info_fields'])) $set['info_fields'] = '[]';
            $sql = 'INSERT INTO services (' . implode(',', array_keys($set)) . ') VALUES (' . implode(',', array_fill(0, count($set), '?')) . ')';
            db()->prepare($sql)->execute(array_values($set));
            $id = (int)db()->lastInsertId();
        }
        out(['ok' => true, 'id' => $id]);

    case 'service_image':
        $id = (int)($_POST['id'] ?? 0);
        $s = db()->prepare('SELECT image_path FROM services WHERE id=?'); $s->execute([$id]);
        $old = $s->fetchColumn();
        if ($old === false) fail('Service not found.', 404);
        if (empty($_FILES['image'])) fail('Please choose a photo.');
        $f = save_upload($_FILES['image'], 'services', ['png', 'jpg', 'jpeg'], 5 * 1048576);
        db()->prepare('UPDATE services SET image_path=? WHERE id=?')->execute([$f[0], $id]);
        delete_file($old);
        out(['ok' => true, 'image' => $f[0]]);

    case 'service_delete':
        $id = (int)($in['id'] ?? 0);
        $files = db()->prepare('SELECT file_path FROM templates WHERE service_id=?'); $files->execute([$id]);
        foreach ($files->fetchAll(PDO::FETCH_COLUMN) as $p) delete_file($p);
        $s = db()->prepare('SELECT image_path FROM services WHERE id=?'); $s->execute([$id]);
        delete_file($s->fetchColumn());
        db()->prepare('DELETE FROM services WHERE id=?')->execute([$id]);
        out(['ok' => true]);

    // ---------------- Templates ----------------
    case 'templates':
        $sid = (int)($_GET['service_id'] ?? 0);
        $s = db()->prepare('SELECT * FROM templates WHERE service_id=? ORDER BY id DESC'); $s->execute([$sid]);
        out(['ok' => true, 'templates' => array_map(function ($t) {
            return ['id' => (int)$t['id'], 'occasion' => $t['occasion'], 'file' => $t['file_path'], 'name' => $t['original_name'],
                    'mime' => $t['mime'], 'size' => (int)$t['size_bytes'], 'createdAt' => $t['created_at']];
        }, $s->fetchAll())]);

    case 'template_upload':
        $sid = (int)($_POST['service_id'] ?? 0);
        $s = db()->prepare('SELECT id FROM services WHERE id=?'); $s->execute([$sid]);
        if (!$s->fetchColumn()) fail('Service not found.', 404);
        $occasion = clean_text($_POST['occasion'] ?? '', 60) ?: 'Other';
        if (empty($_FILES['files'])) fail('Please choose at least one file.');

        $f = $_FILES['files']; $saved = 0; $errors = [];
        $n = is_array($f['name']) ? count($f['name']) : 0;
        for ($i = 0; $i < $n; $i++) {
            $one = ['name' => $f['name'][$i], 'tmp_name' => $f['tmp_name'][$i], 'size' => $f['size'][$i], 'error' => $f['error'][$i]];
            try {
                $r = save_upload($one, 'templates', ['png', 'jpg', 'jpeg', 'pdf', 'svg'], 20 * 1048576);
                db()->prepare('INSERT INTO templates (service_id,occasion,file_path,original_name,mime,size_bytes) VALUES (?,?,?,?,?,?)')
                    ->execute([$sid, $occasion, $r[0], $r[1], $r[2], $r[3]]);
                $saved++;
            } catch (RuntimeException $e) { $errors[] = $e->getMessage(); }
        }
        out(['ok' => $saved > 0, 'saved' => $saved, 'errors' => $errors, 'error' => $saved ? null : ($errors[0] ?? 'Nothing was uploaded.')]);

    case 'template_delete':
        $id = (int)($in['id'] ?? 0);
        $s = db()->prepare('SELECT file_path FROM templates WHERE id=?'); $s->execute([$id]);
        $p = $s->fetchColumn();
        if ($p !== false) { delete_file($p); db()->prepare('DELETE FROM templates WHERE id=?')->execute([$id]); }
        out(['ok' => true]);

    // ---------------- Customers ----------------
    case 'customers':
        $rows = db()->query("SELECT u.id, u.first_name, u.last_name, u.email, u.contact_no, u.created_at,
                                    (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders
                             FROM users u WHERE u.role='customer' AND u.is_verified=1 ORDER BY u.id DESC")->fetchAll();
        out(['ok' => true, 'customers' => array_map(function ($u) {
            return ['id' => 'CUS-' . str_pad($u['id'], 3, '0', STR_PAD_LEFT), 'name' => $u['first_name'] . ' ' . $u['last_name'],
                    'email' => $u['email'], 'phone' => $u['contact_no'], 'orders' => (int)$u['orders'], 'joined' => substr($u['created_at'], 0, 10)];
        }, $rows)]);

    // ---------------- Orders ----------------
    case 'orders':
        $rows = db()->query("SELECT o.*, CONCAT(u.first_name,' ',u.last_name) AS customer
                             FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.id DESC")->fetchAll();
        out(['ok' => true, 'orders' => array_map(function ($o) {
            return ['dbId' => (int)$o['id'], 'id' => $o['order_code'], 'customer' => $o['customer'] ?: 'Deleted customer',
                    'service' => $o['service_name'], 'qty' => (int)$o['qty'], 'total' => (float)$o['total'],
                    'payment' => $o['payment'], 'status' => $o['status'], 'date' => substr($o['created_at'], 0, 10),
                    'payStatus' => $o['payment_status'], 'payOption' => $o['pay_option'], 'amountDue' => (float)$o['amount_due'],
                    'amountPaid' => (float)$o['amount_paid'], 'designImage' => $o['design_image'],
                    'refundStatus' => $o['refund_status'], 'refundAmount' => (float)$o['refund_amount'], 'refundNote' => $o['refund_note'],
                    'fulfillment' => $o['fulfillment'], 'deliveryFee' => (float)$o['delivery_fee'], 'deliveryStatus' => $o['delivery_status'], 'lalamoveRef' => $o['lalamove_ref'],
                    'details' => json_list($o['details'])];
        }, $rows)]);

    case 'order_status':
        $id = (int)($in['id'] ?? 0); $status = $in['status'] ?? '';
        if (!in_array($status, ORDER_STATUSES, true) || $status === 'cancelled') fail('Invalid status.');
        $q = db()->prepare('SELECT * FROM orders WHERE id=?'); $q->execute([$id]);
        $o = $q->fetch();
        if (!$o) fail('Order not found.', 404);
        if ($o['status'] === 'cancelled' || $o['status'] === 'completed') fail('This order is locked.');
        // a delivery order can only go out after the customer paid the Lalamove fee
        if ($o['fulfillment'] === 'delivery' && $status === 'out-for-delivery' && $o['delivery_status'] !== 'paid') {
            if ((float)$o['delivery_fee'] <= 0) fail('Enter the Lalamove delivery fee first (open the order > "Request delivery payment").');
            fail('The customer has not paid the delivery fee yet.');
        }
        db()->prepare("UPDATE orders SET status=? WHERE id=? AND status NOT IN ('cancelled','completed')")->execute([$status, $id]);
        $isDelivery = $o['fulfillment'] === 'delivery' && in_array($status, ['packing', 'out-for-delivery'], true);
        if ($isDelivery && $o['delivery_status'] === 'unpaid' && (float)$o['delivery_fee'] > 0 && $status === 'packing') notify_delivery_fee($id);
        out(['ok' => true, 'needsDeliveryFee' => $isDelivery && (float)$o['delivery_fee'] <= 0]);

    case 'order_delivery_fee':    // the Lalamove rate the admin got from the app
        $id = (int)($in['id'] ?? 0); $fee = round((float)($in['fee'] ?? 0), 2); $ref = clean_text($in['ref'] ?? '', 190);
        $q = db()->prepare('SELECT * FROM orders WHERE id=?'); $q->execute([$id]); $o = $q->fetch();
        if (!$o || $o['fulfillment'] !== 'delivery') fail('This order is not for delivery.');
        if ($o['status'] === 'cancelled') fail('This order was cancelled.');
        if ($o['delivery_status'] === 'paid') fail('The delivery fee was already paid.');
        if ($fee < 20 || $fee > 20000) fail('Enter the Lalamove fee (at least ' . "\u{20B1}" . '20).');
        db()->prepare("UPDATE orders SET delivery_fee=?, delivery_status='unpaid', delivery_session=NULL, lalamove_ref=? WHERE id=?")->execute([$fee, $ref !== '' ? $ref : null, $id]);
        if (in_array($o['status'], ['packing', 'out-for-delivery'], true)) notify_delivery_fee($id);
        out(['ok' => true]);

    case 'order_delivery_paid':   // e.g. the customer paid the rider fee in cash or by bank transfer
        $id = (int)($in['id'] ?? 0);
        db()->prepare("UPDATE orders SET delivery_status='paid', delivery_paid_at=NOW() WHERE id=? AND fulfillment='delivery' AND delivery_fee > 0 AND status <> 'cancelled'")->execute([$id]);
        out(['ok' => true]);

    case 'dashboard':
        $one = function ($sql) { return db()->query($sql)->fetchColumn(); };
        $byStatus = [];
        foreach (db()->query('SELECT status, COUNT(*) c FROM orders GROUP BY status')->fetchAll() as $r) $byStatus[$r['status']] = (int)$r['c'];
        $recent = db()->query("SELECT o.order_code, o.service_name, o.total, o.status, o.payment_status, o.created_at, CONCAT(u.first_name,' ',u.last_name) AS customer
                               FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 6")->fetchAll();
        out(['ok' => true,
             'orders' => (int)$one('SELECT COUNT(*) FROM orders'),
             'customers' => (int)$one("SELECT COUNT(*) FROM users WHERE role='customer' AND is_verified=1"),
             'services' => (int)$one('SELECT COUNT(*) FROM services WHERE is_active=1'),
             'received' => (float)$one("SELECT COALESCE(SUM(amount_paid),0) FROM orders WHERE status <> 'cancelled'"),
             'balance' => (float)$one("SELECT COALESCE(SUM(total - amount_paid),0) FROM orders WHERE status <> 'cancelled'"),
             'byStatus' => $byStatus,
             'recent' => array_map(function ($r) { return ['id' => $r['order_code'], 'customer' => $r['customer'] ?: 'Deleted customer', 'service' => $r['service_name'],
                         'total' => (float)$r['total'], 'status' => $r['status'], 'payStatus' => $r['payment_status'], 'date' => substr($r['created_at'], 0, 10)]; }, $recent)]);

    case 'order_refund_retry':    // try the PayMongo refund again
        $id = (int)($in['id'] ?? 0);
        $q = db()->prepare('SELECT * FROM orders WHERE id=?'); $q->execute([$id]); $o = $q->fetch();
        if (!$o || $o['status'] !== 'cancelled' || $o['amount_paid'] <= 0 || $o['refund_status'] === 'refunded') fail('Nothing to refund for this order.');
        $res = refund_order($o); apply_refund($o, $res);
        out(['ok' => true, 'refundStatus' => $res['status'], 'note' => $res['note']]);

    case 'order_refund_done':     // you refunded it by hand (e.g. in the PayMongo dashboard)
        $id = (int)($in['id'] ?? 0);
        db()->prepare("UPDATE orders SET refund_status='refunded', refund_amount=amount_paid, refund_note=NULL WHERE id=? AND status='cancelled' AND amount_paid > 0")->execute([$id]);
        out(['ok' => true]);

    case 'inquiries':
        $rows = db()->query('SELECT * FROM inquiries ORDER BY id DESC LIMIT 300')->fetchAll();
        out(['ok' => true, 'inquiries' => array_map(function ($r) {
            return ['id' => (int)$r['id'], 'name' => $r['name'], 'contact' => $r['contact'], 'service' => $r['service_name'], 'qty' => (int)$r['qty'],
                    'details' => $r['details'], 'files' => json_list($r['files']), 'status' => $r['status'], 'date' => substr($r['created_at'], 0, 10)];
        }, $rows)]);

    case 'inquiry_status':
        $id = (int)($in['id'] ?? 0); $st = $in['status'] ?? '';
        if (!in_array($st, ['new', 'replied', 'closed'], true)) fail('Invalid status.');
        db()->prepare('UPDATE inquiries SET status=? WHERE id=?')->execute([$st, $id]);
        out(['ok' => true]);

    case 'order_mark_paid':   // e.g. the customer paid the balance in cash on pickup
        $id = (int)($in['id'] ?? 0);
        db()->prepare("UPDATE orders SET amount_paid = total, payment_status = 'paid' WHERE id=? AND status <> 'cancelled'")->execute([$id]);
        out(['ok' => true]);

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
