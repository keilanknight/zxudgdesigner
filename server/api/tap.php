<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

apply_rate_limit();
$slug = (string) ($_GET['slug'] ?? '');
if (!preg_match('/^[A-Za-z0-9_-]{12}$/', $slug)) {
    http_response_code(404);
    exit;
}

$statement = beta_db()->prepare(
    'SELECT p.tap_path, p.tap_bytes
     FROM projects p JOIN users u ON u.id = p.user_id
     WHERE p.slug = ? AND p.is_published = 1 AND u.status = "active"'
);
$statement->execute([$slug]);
$record = $statement->fetch();
if (!$record || empty($record['tap_path'])) {
    http_response_code(404);
    exit;
}

$path = private_path((string) $record['tap_path']);
if (!is_file($path)) {
    http_response_code(404);
    exit;
}

header('Content-Type: application/octet-stream');
header('Content-Length: ' . filesize($path));
header('Content-Disposition: inline; filename="zxudg-' . $slug . '.tap"');
header('Cache-Control: public, no-cache, must-revalidate');
header('ETag: "' . hash_file('sha256', $path) . '"');
header('Access-Control-Allow-Origin: *');
header('X-Content-Type-Options: nosniff');
readfile($path);
