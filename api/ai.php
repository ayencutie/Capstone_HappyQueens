<?php
// AI design suggestions: the customer's prompt -> a safe design "spec" (front + back) that the browser draws instantly.
require __DIR__ . '/config.php';
require __DIR__ . '/lib.php';

if (($_SESSION['user']['role'] ?? '') !== 'customer') fail('Please log in first.', 401);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);
$action = $_GET['action'] ?? '';
if (!in_array($action, ['design', 'edit'], true)) fail('Unknown action.', 404);

$now = time();
$in = input();
$prompt = clean_text($in['prompt'] ?? '', 300);
$product = clean_text($in['service'] ?? 'printed product', 80);
if ($prompt === '') fail('Please describe what you want.');

if ($action === 'edit') {   // edit the customer's own picture (images cost more, so fewer per hour)
    $_SESSION['ai_edits'] = array_values(array_filter($_SESSION['ai_edits'] ?? [], function ($t) use ($now) { return $t > $now - 3600; }));
    if (count($_SESSION['ai_edits']) >= 8) fail('You have reached the AI picture limit for now. Try again in a while.', 429);
    try {
        $path = ai_edit_image((string)($in['path'] ?? ''), $prompt, $product);
        $_SESSION['ai_edits'][] = $now;
        out(['ok' => true, 'path' => $path]);
    } catch (RuntimeException $e) {
        if ($e->getCode() === 501) fail('AI picture editing is not set up.', 501);
        if ($e->getCode() === 400) fail($e->getMessage());
        error_log('AI edit failed: ' . $e->getMessage());
        fail('The AI could not edit this picture right now. Please try again, or use your picture as it is.', 502);
    }
}

// at most 20 AI designs per hour per login (protects your AI credits)
$_SESSION['ai_calls'] = array_values(array_filter($_SESSION['ai_calls'] ?? [], function ($t) use ($now) { return $t > $now - 3600; }));
if (count($_SESSION['ai_calls']) >= 20) fail('You have reached the AI limit for now. Try again in a while.', 429);

try {
    $spec = ai_design_spec($prompt, $product);
    $_SESSION['ai_calls'][] = $now;
    out(['ok' => true, 'spec' => $spec]);
} catch (RuntimeException $e) {
    if ($e->getCode() === 501) fail('AI is not set up, using the built-in designer.', 501);
    error_log('AI design failed: ' . $e->getMessage());
    fail('The AI could not make a design right now.', 502);
}
