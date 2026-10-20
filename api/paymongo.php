<?php
// PayMongo Checkout (GCash + PayMaya). Customers are sent to PayMongo's hosted page; we never see card/e-wallet details.

function paymongo_call($method, $path, $body = null) {
    if (PAYMONGO_SECRET === '') throw new RuntimeException('Online payment is not set up yet (add PAYMONGO_SECRET in api/config.local.php).');
    if (!function_exists('curl_init')) throw new RuntimeException('PHP curl is disabled. In C:\xampp\php\php.ini enable extension=curl, then restart Apache.');
    $ch = curl_init('https://api.paymongo.com/v1' . $path);
    $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_CUSTOMREQUEST => $method,
             CURLOPT_HTTPHEADER => ['Authorization: Basic ' . base64_encode(PAYMONGO_SECRET . ':'), 'Content-Type: application/json', 'Accept: application/json']];
    if ($body !== null) $opts[CURLOPT_POSTFIELDS] = json_encode($body);
    curl_setopt_array($ch, $opts);
    if (function_exists('ca_bundle') && ($ca = ca_bundle())) curl_setopt($ch, CURLOPT_CAINFO, $ca);
    $res = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($res === false) throw new RuntimeException('Could not reach PayMongo: ' . $err);
    $data = json_decode($res, true);
    if ($http >= 400 || !is_array($data)) {
        $msg = $data['errors'][0]['detail'] ?? 'PayMongo returned an error (HTTP ' . $http . ').';
        throw new RuntimeException($msg);
    }
    return $data;
}

function site_base() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $dir = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME']))), '/');
    return $scheme . '://' . $_SERVER['HTTP_HOST'] . $dir;
}

// Creates the hosted checkout page for the amount due now. Returns ['id'=>..., 'url'=>...]
function paymongo_checkout($code, $serviceName, $dueCents, $payOption) {
    $label = $payOption === 'down' ? 'Down payment (' . DOWNPAYMENT_PERCENT . '%)' : 'Full payment';
    $back = site_base() . '/client-side/html/order-complete.html?order=' . urlencode($code);
    $r = paymongo_call('POST', '/checkout_sessions', ['data' => ['attributes' => [
        'line_items' => [['currency' => 'PHP', 'amount' => (int)$dueCents, 'name' => $label . ' - ' . $serviceName, 'quantity' => 1, 'description' => 'Order ' . $code]],
        'payment_method_types' => ['gcash', 'paymaya'],
        'success_url' => $back,
        'cancel_url' => $back . '&cancelled=1',
        'description' => "Happy Queen's Crafty House order " . $code,
        'reference_number' => $code,
        'send_email_receipt' => false,
        'show_description' => true,
        'show_line_items' => true,
        'metadata' => ['order_code' => $code],
    ]]]);
    return ['id' => $r['data']['id'], 'url' => $r['data']['attributes']['checkout_url']];
}

// Asks PayMongo whether the customer really paid, then updates the order. Safe to call many times.
function sync_payment(array $o) {
    if ($o['payment_status'] !== 'unpaid' || !$o['checkout_session']) return $o;
    $r = paymongo_call('GET', '/checkout_sessions/' . rawurlencode($o['checkout_session']));
    $a = $r['data']['attributes'] ?? [];
    $paid = false; $method = ''; $payId = null;
    foreach (($a['payments'] ?? []) as $p) {
        if (($p['attributes']['status'] ?? '') === 'paid') { $paid = true; $payId = $p['id'] ?? null; $method = $p['attributes']['source']['type'] ?? ''; }
    }
    if (!$paid && (($a['payment_intent']['attributes']['status'] ?? '') === 'succeeded')) $paid = true;
    if ($paid) {
        $labels = ['gcash' => 'GCash', 'paymaya' => 'PayMaya', 'maya' => 'PayMaya'];
        db()->prepare("UPDATE orders SET amount_paid = amount_due, payment_status = ?, payment = ?, payment_id = ?, paid_at = NOW() WHERE id = ? AND payment_status = 'unpaid' AND status <> 'cancelled'")
            ->execute([$o['pay_option'] === 'full' ? 'paid' : 'partial', $labels[$method] ?? 'PayMongo', $payId, $o['id']]);
        $s = db()->prepare('SELECT * FROM orders WHERE id=?'); $s->execute([$o['id']]);
        return $s->fetch();
    }
    return $o;
}


// Sends the customer's money back (down payment or full payment) through PayMongo.
// If PayMongo can't do it automatically, the order is flagged "manual" so the admin can refund it in the PayMongo dashboard.
function refund_order(array $o) {
    $amount = (float)$o['amount_paid'];
    if ($amount <= 0) return ['status' => 'none', 'id' => null, 'note' => null, 'payment_id' => null];
    $pid = $o['payment_id'];
    try {
        if (!$pid && $o['checkout_session']) {
            $r = paymongo_call('GET', '/checkout_sessions/' . rawurlencode($o['checkout_session']));
            foreach (($r['data']['attributes']['payments'] ?? []) as $p) if (($p['attributes']['status'] ?? '') === 'paid') $pid = $p['id'];
        }
        if (!$pid) throw new RuntimeException('Payment reference not found.');
        $r = paymongo_call('POST', '/refunds', ['data' => ['attributes' => [
            'amount' => (int)round($amount * 100), 'payment_id' => $pid, 'reason' => 'requested_by_customer',
            'notes' => 'Order ' . $o['order_code'] . ' cancelled by the customer']]]);
        $st = $r['data']['attributes']['status'] ?? 'pending';
        return ['status' => $st === 'succeeded' ? 'refunded' : 'processing', 'id' => $r['data']['id'] ?? null, 'note' => null, 'payment_id' => $pid];
    } catch (RuntimeException $e) {
        return ['status' => 'manual', 'id' => null, 'note' => mb_substr($e->getMessage(), 0, 180), 'payment_id' => $pid];
    }
}

function apply_refund(array $o, array $res) {
    db()->prepare('UPDATE orders SET refund_status=?, refund_amount=?, refund_id=?, refund_note=?, payment_id=COALESCE(?, payment_id) WHERE id=?')
        ->execute([$res['status'], $res['status'] === 'none' ? 0 : $o['amount_paid'], $res['id'], $res['note'], $res['payment_id'], $o['id']]);
}


// ---- Lalamove delivery fee: a separate PayMongo payment, asked when the order is packing / out for delivery ----
function paymongo_delivery_checkout($code, $feeCents) {
    $back = site_base() . '/client-side/html/order-complete.html?order=' . urlencode($code) . '&delivery=1';
    $r = paymongo_call('POST', '/checkout_sessions', ['data' => ['attributes' => [
        'line_items' => [['currency' => 'PHP', 'amount' => (int)$feeCents, 'name' => 'Lalamove delivery fee', 'quantity' => 1, 'description' => 'Order ' . $code]],
        'payment_method_types' => ['gcash', 'paymaya'],
        'success_url' => $back, 'cancel_url' => $back . '&cancelled=1',
        'description' => "Happy Queen's Crafty House delivery fee for order " . $code,
        'reference_number' => $code . '-DELIVERY', 'send_email_receipt' => false, 'show_description' => true, 'show_line_items' => true,
        'metadata' => ['order_code' => $code, 'type' => 'delivery'],
    ]]]);
    return ['id' => $r['data']['id'], 'url' => $r['data']['attributes']['checkout_url']];
}

function sync_delivery(array $o) {
    if ($o['delivery_status'] !== 'unpaid' || !$o['delivery_session']) return $o;
    $r = paymongo_call('GET', '/checkout_sessions/' . rawurlencode($o['delivery_session']));
    $a = $r['data']['attributes'] ?? [];
    $paid = false; $payId = null;
    foreach (($a['payments'] ?? []) as $p) if (($p['attributes']['status'] ?? '') === 'paid') { $paid = true; $payId = $p['id'] ?? null; }
    if (!$paid && (($a['payment_intent']['attributes']['status'] ?? '') === 'succeeded')) $paid = true;
    if ($paid) {
        db()->prepare("UPDATE orders SET delivery_status='paid', delivery_payment_id=?, delivery_paid_at=NOW() WHERE id=? AND delivery_status='unpaid'")->execute([$payId, $o['id']]);
        $s = db()->prepare('SELECT * FROM orders WHERE id=?'); $s->execute([$o['id']]);
        return $s->fetch();
    }
    return $o;
}

// Tells the customer (by email, if email is set up) that the delivery fee is ready to pay. Never stops the admin if it fails.
function notify_delivery_fee($orderId) {
    try {
        $q = db()->prepare('SELECT o.order_code, o.delivery_fee, u.email, u.first_name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id=?');
        $q->execute([$orderId]); $r = $q->fetch();
        if (!$r) return;
        if (APP_DEBUG || MAIL_USER === '' || MAIL_PASS === '') { error_log('Delivery fee email not sent (email not set up): ' . $r['email']); return; }
        smtp_send($r['email'], 'Delivery fee for your order ' . $r['order_code'],
            "Hi " . $r['first_name'] . ",\r\n\r\nYour order " . $r['order_code'] . " is being prepared for delivery.\r\nThe Lalamove delivery fee is PHP " . number_format((float)$r['delivery_fee'], 2) .
            ".\r\nPlease pay it so we can book your rider: " . site_base() . "/client-side/html/orders.html\r\n\r\nThank you!\r\nHappy Queen's Crafty House");
    } catch (Throwable $e) { error_log('Delivery fee email failed: ' . $e->getMessage()); }
}
