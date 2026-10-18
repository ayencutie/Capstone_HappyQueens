<?php
// AI design suggestions: the customer's prompt -> a safe design "spec" that the browser draws instantly.
require __DIR__ . '/config.php';
require __DIR__ . '/lib.php';

if (($_SESSION['user']['role'] ?? '') !== 'customer') fail('Please log in first.', 401);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);
if (($_GET['action'] ?? '') !== 'design') fail('Unknown action.', 404);
if (ANTHROPIC_API_KEY === '') fail('AI is not set up, using the built-in designer.', 501);

// at most 20 AI designs per hour per login (protects your API credits)
$now = time();
$_SESSION['ai_calls'] = array_values(array_filter($_SESSION['ai_calls'] ?? [], function ($t) use ($now) { return $t > $now - 3600; }));
if (count($_SESSION['ai_calls']) >= 20) fail('You have reached the AI limit for now. Try again in a while.', 429);

$in = input();
$prompt = clean_text($in['prompt'] ?? '', 300);
$product = clean_text($in['service'] ?? 'printed product', 80);
if ($prompt === '') fail('Please describe the design you want.');
$_SESSION['ai_calls'][] = $now;

$system = "You are a print designer. The customer describes a design for a custom printed product. Reply with ONLY one JSON object, no markdown, no explanation, in exactly this shape:\n" .
 '{"name":"short design name","background":{"type":"gradient|solid","colors":["#rrggbb","#rrggbb"],"angle":135},' .
 '"pattern":{"type":"none|dots|stripes|confetti|florals|hearts|stars|waves|grid|sparkles","color":"#rrggbb","opacity":0.3,"density":5},' .
 '"border":{"style":"none|solid|double|dashed|ornate","color":"#rrggbb","width":3},' .
 '"text":{"color":"#rrggbb","accent":"#rrggbb","headingFont":"FONT","bodyFont":"FONT"}}' . "\n" .
 'FONT must be one of: ' . implode(', ', SPEC_FONTS) . '. Pick colors that suit the request, and make sure text.color has strong contrast with the background colors.';

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40,
    CURLOPT_HTTPHEADER => ['x-api-key: ' . ANTHROPIC_API_KEY, 'anthropic-version: 2023-06-01', 'content-type: application/json'],
    CURLOPT_POSTFIELDS => json_encode(['model' => AI_MODEL, 'max_tokens' => 700, 'system' => $system,
        'messages' => [['role' => 'user', 'content' => "Product: $product\nDesign request: $prompt"]]]),
]);
if (function_exists('ca_bundle') && ($ca = ca_bundle())) curl_setopt($ch, CURLOPT_CAINFO, $ca);
$res = curl_exec($ch); $http = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);

$data = json_decode((string)$res, true);
$text = $data['content'][0]['text'] ?? '';
if ($http !== 200 || $text === '') { error_log('AI error: ' . substr((string)$res, 0, 300)); fail('The AI could not make a design right now.', 502); }
$json = json_decode(substr($text, strpos($text, '{'), strrpos($text, '}') - strpos($text, '{') + 1), true);
$spec = clean_spec($json);
if (!$spec) fail('The AI answer could not be used.', 502);
out(['ok' => true, 'spec' => $spec]);
