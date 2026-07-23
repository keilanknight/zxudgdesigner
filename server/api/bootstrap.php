<?php

declare(strict_types=1);

const ZXUDG_UDG_BANKS = 4;
const ZXUDG_UDGS_PER_BANK = 21;
const ZXUDG_GRID_SIZE = 8;
const ZXUDG_SCREEN_ROWS = 24;
const ZXUDG_SCREEN_COLS = 32;

function beta_data_dir(): string
{
    $override = getenv('ZXUDG_BETA_DATA_DIR');
    if (is_string($override) && $override !== '') {
        return rtrim($override, '/');
    }

    return dirname(__DIR__, 4) . '/speccy-beta-data';
}

function beta_config(): array
{
    static $config;
    if (is_array($config)) {
        return $config;
    }

    $path = beta_data_dir() . '/config.php';
    if (!is_file($path)) {
        throw new RuntimeException('The beta server configuration has not been installed.');
    }

    $loaded = require $path;
    if (!is_array($loaded)) {
        throw new RuntimeException('The beta server configuration is invalid.');
    }

    $defaults = [
        'google_client_id' => '',
        'admin_emails' => [],
        'base_url' => '',
        'cookie_path' => '/speccy/beta/',
        'session_name' => 'zxudg_beta_session',
        'project_limit' => 50,
        'max_project_bytes' => 1048576,
        'max_tap_bytes' => 32768,
        'max_user_storage_bytes' => 26214400,
        'rate_limit_requests' => 120,
        'rate_limit_window_seconds' => 60,
    ];
    $config = array_merge($defaults, $loaded);
    return $config;
}

function ensure_beta_directories(): void
{
    $base = beta_data_dir();
    foreach ([$base, $base . '/projects', $base . '/taps', $base . '/tmp'] as $directory) {
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Could not create private beta storage.');
        }
    }
}

function beta_db(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    ensure_beta_directories();
    $pdo = new PDO('sqlite:' . beta_data_dir() . '/cloud.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            google_sub TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            display_name TEXT NOT NULL,
            picture_url TEXT,
            role TEXT NOT NULL DEFAULT "user",
            status TEXT NOT NULL DEFAULT "active",
            created_at TEXT NOT NULL,
            last_login_at TEXT NOT NULL
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            slug TEXT UNIQUE,
            is_published INTEGER NOT NULL DEFAULT 0,
            project_path TEXT NOT NULL,
            tap_path TEXT,
            project_bytes INTEGER NOT NULL DEFAULT 0,
            tap_bytes INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            published_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS rate_limits (
            client_key TEXT PRIMARY KEY,
            window_started INTEGER NOT NULL,
            request_count INTEGER NOT NULL
        )'
    );
    $pdo->exec('CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS projects_slug_idx ON projects(slug)');
    return $pdo;
}

function start_beta_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $config = beta_config();
    session_name((string) $config['session_name']);
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 14,
        'path' => (string) $config['cookie_path'],
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    if (!isset($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
}

function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function apply_rate_limit(): void
{
    $config = beta_config();
    $limit = max(10, (int) $config['rate_limit_requests']);
    $window = max(10, (int) $config['rate_limit_window_seconds']);
    $now = time();
    $address = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $key = hash('sha256', $address);
    $pdo = beta_db();
    $statement = $pdo->prepare(
        'SELECT window_started, request_count FROM rate_limits WHERE client_key = ?'
    );
    $statement->execute([$key]);
    $record = $statement->fetch();

    if (!$record || $now - (int) $record['window_started'] >= $window) {
        $statement = $pdo->prepare(
            'INSERT OR REPLACE INTO rate_limits (client_key, window_started, request_count)
             VALUES (?, ?, 1)'
        );
        $statement->execute([$key, $now]);
        if (random_int(1, 100) === 1) {
            $pdo->prepare('DELETE FROM rate_limits WHERE window_started < ?')
                ->execute([$now - ($window * 2)]);
        }
        return;
    }

    $count = (int) $record['request_count'] + 1;
    if ($count > $limit) {
        header('Retry-After: ' . max(1, $window - ($now - (int) $record['window_started'])));
        api_error('Too many requests. Please wait a moment and try again.', 429);
    }
    $pdo->prepare('UPDATE rate_limits SET request_count = ? WHERE client_key = ?')
        ->execute([$count, $key]);
}

function api_error(string $message, int $status = 400): never
{
    json_response(['ok' => false, 'error' => $message], $status);
}

function request_json(): array
{
    $config = beta_config();
    $length = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($length > ((int) $config['max_project_bytes'] * 2)) {
        api_error('The request is too large.', 413);
    }

    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($decoded)) {
        api_error('Invalid JSON request.');
    }

    return $decoded;
}

function require_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        api_error('Method not allowed.', 405);
    }
}

function require_csrf(): void
{
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($provided) || !hash_equals((string) ($_SESSION['csrf'] ?? ''), $provided)) {
        api_error('Your session token is invalid. Refresh the page and try again.', 403);
    }
}

function current_user(bool $required = true): ?array
{
    $userId = isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : 0;
    if ($userId < 1) {
        if ($required) {
            api_error('Sign in to use cloud projects.', 401);
        }
        return null;
    }

    $statement = beta_db()->prepare(
        'SELECT id, google_sub, email, display_name, picture_url, role, status,
                created_at, last_login_at
         FROM users WHERE id = ?'
    );
    $statement->execute([$userId]);
    $user = $statement->fetch();
    if (!$user || $user['status'] !== 'active') {
        unset($_SESSION['user_id']);
        if ($required) {
            api_error('This account is not available.', 403);
        }
        return null;
    }

    return $user;
}

function require_admin(): array
{
    $user = current_user();
    if ($user['role'] !== 'admin') {
        api_error('Administrator access is required.', 403);
    }
    return $user;
}

function public_user(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'email' => $user['email'],
        'name' => $user['display_name'],
        'picture' => $user['picture_url'],
        'role' => $user['role'],
        'status' => $user['status'],
    ];
}

function verify_google_token(string $credential): array
{
    $config = beta_config();
    if ($config['google_client_id'] === '' || $config['google_client_id'] === 'REPLACE_WITH_GOOGLE_CLIENT_ID') {
        api_error('Google sign-in has not been configured yet.', 503);
    }
    if (strlen($credential) > 8192) {
        api_error('The Google credential is invalid.', 401);
    }

    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($credential);
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    if (!is_string($body) || $status !== 200) {
        api_error('Google could not verify this sign-in.', 401);
    }

    $claims = json_decode($body, true);
    $issuer = $claims['iss'] ?? '';
    $audience = $claims['aud'] ?? '';
    $expires = isset($claims['exp']) ? (int) $claims['exp'] : 0;
    if (
        !is_array($claims) ||
        !in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true) ||
        !hash_equals((string) $config['google_client_id'], (string) $audience) ||
        $expires <= time() ||
        !in_array($claims['email_verified'] ?? false, [true, 'true', 1, '1'], true) ||
        !isset($claims['sub'], $claims['email'])
    ) {
        api_error('The Google identity token is invalid.', 401);
    }

    return $claims;
}

function login_google_user(array $claims): array
{
    $pdo = beta_db();
    $sub = (string) $claims['sub'];
    $email = mb_strtolower(trim((string) $claims['email']));
    $name = trim((string) ($claims['name'] ?? $email));
    $picture = isset($claims['picture']) ? (string) $claims['picture'] : null;
    $now = gmdate('c');

    $statement = $pdo->prepare('SELECT * FROM users WHERE google_sub = ?');
    $statement->execute([$sub]);
    $user = $statement->fetch();

    if (!$user) {
        $adminEmails = array_map(
            static fn($value): string => mb_strtolower(trim((string) $value)),
            (array) beta_config()['admin_emails']
        );
        $role = in_array($email, $adminEmails, true) ? 'admin' : 'user';
        $statement = $pdo->prepare(
            'INSERT INTO users
             (google_sub, email, display_name, picture_url, role, status, created_at, last_login_at)
             VALUES (?, ?, ?, ?, ?, "active", ?, ?)'
        );
        $statement->execute([$sub, $email, $name, $picture, $role, $now, $now]);
        $userId = (int) $pdo->lastInsertId();
    } else {
        if ($user['status'] !== 'active') {
            api_error('This account has been disabled.', 403);
        }
        $userId = (int) $user['id'];
        $statement = $pdo->prepare(
            'UPDATE users SET email = ?, display_name = ?, picture_url = ?, last_login_at = ?
             WHERE id = ?'
        );
        $statement->execute([$email, $name, $picture, $now, $userId]);
    }

    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    return current_user();
}

function clean_project_name(mixed $value): string
{
    $name = trim((string) $value);
    $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
    if ($name === '') {
        $name = 'My Spectrum Graphics';
    }
    return mb_substr($name, 0, 80);
}

function valid_colour(mixed $value): bool
{
    return in_array(
        $value,
        ['Black', 'Blue', 'Red', 'Magenta', 'Green', 'Cyan', 'Yellow', 'White'],
        true
    );
}

function validate_project(array $project): void
{
    if (($project['format'] ?? '') !== 'zx-spectrum-udg-editor-project') {
        api_error('This is not a ZX Spectrum UDG Editor project.');
    }

    $banks = $project['udgBanks'] ?? null;
    if (!is_array($banks) || count($banks) < 1 || count($banks) > ZXUDG_UDG_BANKS) {
        api_error('The project contains invalid UDG banks.');
    }

    foreach ($banks as $bank) {
        if (!is_array($bank) || count($bank) !== ZXUDG_UDGS_PER_BANK) {
            api_error('The project contains an invalid UDG bank.');
        }
        foreach ($bank as $grid) {
            if (!is_array($grid) || count($grid) !== ZXUDG_GRID_SIZE) {
                api_error('The project contains an invalid UDG.');
            }
            foreach ($grid as $row) {
                if (!is_array($row) || count($row) !== ZXUDG_GRID_SIZE) {
                    api_error('The project contains an invalid UDG row.');
                }
                foreach ($row as $pixel) {
                    if (!in_array($pixel, [0, 1, false, true], true)) {
                        api_error('The project contains an invalid UDG pixel.');
                    }
                }
            }
        }
    }

    $colourBanks = $project['udgColourBanks'] ?? [];
    if (!is_array($colourBanks) || count($colourBanks) > ZXUDG_UDG_BANKS) {
        api_error('The project contains invalid UDG colours.');
    }
    foreach ($colourBanks as $bank) {
        if (!is_array($bank) || count($bank) !== ZXUDG_UDGS_PER_BANK) {
            api_error('The project contains invalid UDG colours.');
        }
        foreach ($bank as $colours) {
            if (
                !is_array($colours) ||
                !valid_colour($colours['ink'] ?? null) ||
                !valid_colour($colours['paper'] ?? null) ||
                (isset($colours['bright']) && !is_bool($colours['bright']))
            ) {
                api_error('The project contains invalid UDG colours.');
            }
        }
    }

    $screens = $project['screens'] ?? null;
    if (!is_array($screens) || count($screens) < 1 || count($screens) > 100) {
        api_error('The project must contain between 1 and 100 screens.');
    }
    foreach ($screens as $screen) {
        if (
            !is_array($screen) ||
            !valid_colour($screen['defaultInk'] ?? null) ||
            !valid_colour($screen['defaultPaper'] ?? null) ||
            (isset($screen['defaultBright']) && !is_bool($screen['defaultBright'])) ||
            !is_array($screen['cells'] ?? null) ||
            count($screen['cells']) !== ZXUDG_SCREEN_ROWS
        ) {
            api_error('The project contains an invalid screen.');
        }
        foreach ($screen['cells'] as $row) {
            if (!is_array($row) || count($row) !== ZXUDG_SCREEN_COLS) {
                api_error('The project contains an invalid screen row.');
            }
            foreach ($row as $cell) {
                if ($cell === null) {
                    continue;
                }
                if (
                    !is_array($cell) ||
                    !isset($cell['udg']) ||
                    (int) $cell['udg'] < 0 ||
                    (int) $cell['udg'] >= ZXUDG_UDGS_PER_BANK ||
                    (int) ($cell['bank'] ?? 0) < 0 ||
                    (int) ($cell['bank'] ?? 0) >= ZXUDG_UDG_BANKS ||
                    !valid_colour($cell['foreground'] ?? null) ||
                    !valid_colour($cell['background'] ?? null) ||
                    (isset($cell['bright']) && !is_bool($cell['bright']))
                ) {
                    api_error('The project contains an invalid screen cell.');
                }
            }
        }
    }
}

function project_relative_path(int $userId, string $projectId): string
{
    return 'projects/' . $userId . '/' . $projectId . '.json.gz';
}

function tap_relative_path(string $slug): string
{
    return 'taps/' . $slug . '.tap';
}

function private_path(string $relative): string
{
    $relative = ltrim($relative, '/');
    if (str_contains($relative, '..')) {
        throw new RuntimeException('Invalid private path.');
    }
    return beta_data_dir() . '/' . $relative;
}

function atomic_write(string $path, string $contents): void
{
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Could not create project storage.');
    }

    $temporary = beta_data_dir() . '/tmp/' . bin2hex(random_bytes(12));
    if (file_put_contents($temporary, $contents, LOCK_EX) === false) {
        throw new RuntimeException('Could not write the project.');
    }
    chmod($temporary, 0600);
    if (!rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException('Could not finish saving the project.');
    }
}

function load_project_json(array $record): array
{
    $compressed = file_get_contents(private_path((string) $record['project_path']));
    if ($compressed === false) {
        throw new RuntimeException('The stored project could not be read.');
    }
    $json = gzdecode($compressed);
    $project = json_decode($json === false ? '' : $json, true);
    if (!is_array($project)) {
        throw new RuntimeException('The stored project is damaged.');
    }
    return $project;
}

function project_record(string $projectId, int $userId): array
{
    if (!preg_match('/^[a-f0-9]{32}$/', $projectId)) {
        api_error('Invalid project ID.');
    }
    $statement = beta_db()->prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?');
    $statement->execute([$projectId, $userId]);
    $record = $statement->fetch();
    if (!$record) {
        api_error('Project not found.', 404);
    }
    return $record;
}

function project_summary(array $record): array
{
    $config = beta_config();
    $published = (int) $record['is_published'] === 1;
    return [
        'id' => $record['id'],
        'name' => $record['name'],
        'published' => $published,
        'slug' => $published ? $record['slug'] : null,
        'shareUrl' => $published ? $config['base_url'] . '/?project=' . $record['slug'] : null,
        'tapUrl' => $published ? $config['base_url'] . '/t/' . $record['slug'] . '.tap' : null,
        'projectBytes' => (int) $record['project_bytes'],
        'tapBytes' => (int) $record['tap_bytes'],
        'createdAt' => $record['created_at'],
        'updatedAt' => $record['updated_at'],
        'publishedAt' => $record['published_at'],
    ];
}

function random_project_id(): string
{
    return bin2hex(random_bytes(16));
}

function random_slug(): string
{
    return rtrim(strtr(base64_encode(random_bytes(9)), '+/', '-_'), '=');
}

function validate_tap(string $tap): void
{
    $length = strlen($tap);
    $config = beta_config();
    if ($length < 8 || $length > (int) $config['max_tap_bytes']) {
        api_error('The TAP file size is invalid.');
    }

    $offset = 0;
    $blocks = 0;
    while ($offset < $length) {
        if ($offset + 2 > $length) {
            api_error('The TAP file is incomplete.');
        }
        $blockLength = ord($tap[$offset]) | (ord($tap[$offset + 1]) << 8);
        $offset += 2;
        if ($blockLength < 2 || $offset + $blockLength > $length) {
            api_error('The TAP file contains an invalid block.');
        }
        $checksum = 0;
        for ($index = 0; $index < $blockLength; $index++) {
            $checksum ^= ord($tap[$offset + $index]);
        }
        if ($checksum !== 0) {
            api_error('The TAP file checksum is invalid.');
        }
        $offset += $blockLength;
        $blocks++;
    }
    if ($blocks < 4 || $offset !== $length) {
        api_error('The TAP file does not contain a complete loader and package.');
    }
}

function delete_project_files(array $record): void
{
    @unlink(private_path((string) $record['project_path']));
    if (!empty($record['tap_path'])) {
        @unlink(private_path((string) $record['tap_path']));
    }
}

set_exception_handler(static function (Throwable $error): never {
    error_log((string) $error);
    api_error('The cloud service encountered an unexpected error.', 500);
});
