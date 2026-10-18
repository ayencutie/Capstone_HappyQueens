<?php
// OPTIONAL. Lets PayMongo tell us about a payment even if the customer closes the browser before coming back.
// Needs a public URL (e.g. your live website or ngrok) - it can't reach http://localhost.
// PayMongo dashboard > Developers > Webhooks > event "checkout_session.payment.paid" > URL: https://YOUR-SITE/api/paymongo-webhook.php
require __DIR__ . '/config.php';
require __DIR__ . '/paymongo.php';

$event = json_decode(file_get_contents('php://input'), true);
$sessionId = $event['data']['attributes']['data']['id'] ?? '';
if ($sessionId) {
    try {
        $s = db()->prepare('SELECT * FROM orders WHERE checkout_session = ?'); $s->execute([$sessionId]);
        if ($o = $s->fetch()) sync_payment($o);   // re-checks with PayMongo itself, so a fake request can't mark anything paid
    } catch (Throwable $e) { error_log($e->getMessage()); }
}
echo json_encode(['ok' => true]);
