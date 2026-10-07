<?php
/*
 * Oulun Paitapaino - contact form mailer (cPanel hosting, no dependencies).
 * Set the two constants below before going live.
 * POST only. Returns JSON when called with fetch (Accept: application/json),
 * otherwise redirects back to ../index.html?lahetys=ok#paperilappu (or an error code).
 */

const MAIL_TO   = 'info@oulunpaitapaino.fi';        // recipient of the form messages
const MAIL_FROM = 'lomake@oulunpaitapaino.fi';      // a mailbox on the same domain (helps deliverability)
const MIN_FILL_MS = 3000;                           // faster than this = bot
const BACK_URL = '../index.html';

function wants_json(): bool {
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    return stripos($accept, 'application/json') !== false;
}

function done(bool $ok, string $code, int $http): void {
    if (wants_json()) {
        http_response_code($http);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $code]);
    } else {
        header('Location: ' . BACK_URL . '?lahetys=' . ($ok ? 'ok' : rawurlencode($code)) . '#paperilappu', true, 303);
    }
    exit;
}

// Single-line text: strip control chars (including CR/LF), trim, cap length.
function clean_line($v, int $max): string {
    $v = is_string($v) ? $v : '';
    $v = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v) ?? '';
    $v = trim($v);
    return mb_substr($v, 0, $max, 'UTF-8');
}

// Multi-line text: normalise newlines, drop other control chars, cap length.
function clean_text($v, int $max): string {
    $v = is_string($v) ? $v : '';
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', $v) ?? '';
    $v = trim($v);
    return mb_substr($v, 0, $max, 'UTF-8');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Vain POST.';
    exit;
}

// Honeypot: real visitors never see this field.
if (!empty($_POST['www'])) { done(false, 'virhe', 400); }

// Minimum fill time, measured by the page in the visitor's browser.
// Empty (no-JS post) is allowed; the honeypot is the only check then.
$kesto = $_POST['kesto'] ?? '';
if ($kesto !== '' && (!ctype_digit((string)$kesto) || (int)$kesto < MIN_FILL_MS)) { done(false, 'nopea', 400); }

$nimi   = clean_line($_POST['nimi'] ?? '', 100);
$klaani = clean_line($_POST['klaani'] ?? '', 100);
$yhteys = clean_line($_POST['yhteys'] ?? '', 150);
$viesti = clean_text($_POST['viesti'] ?? '', 5000);

if ($nimi === '' || $yhteys === '' || $viesti === '' || mb_strlen($yhteys, 'UTF-8') < 5) {
    done(false, 'missing', 422);
}

$subject = '=?UTF-8?B?' . base64_encode('Heippalappu: ' . $nimi) . '?=';
$body = "Nimi: $nimi\n"
      . ($klaani !== '' ? "Klaani: $klaani\n" : '')
      . "Yhteystieto: $yhteys\n\n"
      . $viesti . "\n";

$headers = [
    'From: ' . MAIL_FROM,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
];
// Reply-To only when the contact field is a valid email (values already have no CR/LF).
if (filter_var($yhteys, FILTER_VALIDATE_EMAIL)) {
    $headers[] = 'Reply-To: ' . $yhteys;
}

$sent = @mail(MAIL_TO, $subject, $body, implode("\r\n", $headers), '-f' . MAIL_FROM);
done($sent, $sent ? 'ok' : 'fail', $sent ? 200 : 500);
