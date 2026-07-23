<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

start_beta_session();
apply_rate_limit();
$action = (string) ($_GET['action'] ?? 'config');

if ($action === 'config') {
    $config = beta_config();
    json_response([
        'ok' => true,
        'googleClientId' => $config['google_client_id'],
        'csrf' => $_SESSION['csrf'],
        'limits' => [
            'projects' => (int) $config['project_limit'],
            'projectBytes' => (int) $config['max_project_bytes'],
            'tapBytes' => (int) $config['max_tap_bytes'],
        ],
    ]);
}

if ($action === 'me') {
    json_response(['ok' => true, 'user' => ($user = current_user(false)) ? public_user($user) : null]);
}

if ($action === 'google-login') {
    require_method('POST');
    require_csrf();
    $request = request_json();
    $credential = isset($request['credential']) ? (string) $request['credential'] : '';
    $user = login_google_user(verify_google_token($credential));
    json_response(['ok' => true, 'user' => public_user($user)]);
}

if ($action === 'logout') {
    require_method('POST');
    require_csrf();
    $_SESSION = [];
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    json_response(['ok' => true, 'csrf' => $_SESSION['csrf']]);
}

if ($action === 'projects') {
    require_method('GET');
    $user = current_user();
    $statement = beta_db()->prepare(
        'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC'
    );
    $statement->execute([(int) $user['id']]);
    $projects = array_map('project_summary', $statement->fetchAll());
    json_response(['ok' => true, 'projects' => $projects]);
}

if ($action === 'load-project') {
    require_method('GET');
    $user = current_user();
    $record = project_record((string) ($_GET['id'] ?? ''), (int) $user['id']);
    json_response([
        'ok' => true,
        'project' => load_project_json($record),
        'meta' => project_summary($record),
    ]);
}

if ($action === 'save-project') {
    require_method('POST');
    require_csrf();
    $user = current_user();
    $request = request_json();
    $project = $request['project'] ?? null;
    if (!is_array($project)) {
        api_error('Project data is required.');
    }
    $projectType = validate_project($project);
    $name = clean_project_name($request['name'] ?? ($project['projectName'] ?? ''));
    $project['projectName'] = $name;
    $project['savedAt'] = gmdate('c');
    $json = json_encode($project, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($json) || strlen($json) > (int) beta_config()['max_project_bytes']) {
        api_error('This project is too large for cloud storage.', 413);
    }

    $pdo = beta_db();
    $projectId = isset($request['id']) ? (string) $request['id'] : '';
    $isNew = $projectId === '';
    $existing = null;
    if ($isNew) {
        $statement = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = ?');
        $statement->execute([(int) $user['id']]);
        if ((int) $statement->fetchColumn() >= (int) beta_config()['project_limit']) {
            api_error('Your cloud project limit has been reached.', 409);
        }
        $projectId = random_project_id();
    } else {
        $existing = project_record($projectId, (int) $user['id']);
    }

    $statement = $pdo->prepare(
        'SELECT COALESCE(SUM(project_bytes + tap_bytes), 0) FROM projects WHERE user_id = ?'
    );
    $statement->execute([(int) $user['id']]);
    $currentBytes = (int) $statement->fetchColumn();
    $replacedBytes = $existing ? (int) $existing['project_bytes'] : 0;
    if ($currentBytes - $replacedBytes + strlen($json) > (int) beta_config()['max_user_storage_bytes']) {
        api_error('Your cloud storage allowance has been reached.', 409);
    }

    $relativePath = project_relative_path((int) $user['id'], $projectId);
    $compressed = gzencode($json, 9);
    if (!is_string($compressed)) {
        throw new RuntimeException('Could not compress the project.');
    }
    atomic_write(private_path($relativePath), $compressed);
    $now = gmdate('c');

    if ($isNew) {
        $statement = $pdo->prepare(
            'INSERT INTO projects
             (id, user_id, project_type, name, project_path, project_bytes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([
            $projectId,
            (int) $user['id'],
            $projectType,
            $name,
            $relativePath,
            strlen($json),
            $now,
            $now,
        ]);
    } else {
        $statement = $pdo->prepare(
            'UPDATE projects
             SET project_type = ?, name = ?, project_bytes = ?, updated_at = ?
             WHERE id = ?'
        );
        $statement->execute([$projectType, $name, strlen($json), $now, $projectId]);
    }

    $record = project_record($projectId, (int) $user['id']);
    json_response(['ok' => true, 'project' => project_summary($record)]);
}

if ($action === 'delete-project') {
    require_method('POST');
    require_csrf();
    $user = current_user();
    $request = request_json();
    $record = project_record((string) ($request['id'] ?? ''), (int) $user['id']);
    $statement = beta_db()->prepare('DELETE FROM projects WHERE id = ? AND user_id = ?');
    $statement->execute([$record['id'], (int) $user['id']]);
    delete_project_files($record);
    json_response(['ok' => true]);
}

if ($action === 'publish-project') {
    require_method('POST');
    require_csrf();
    $user = current_user();
    $request = request_json();
    $record = project_record((string) ($request['id'] ?? ''), (int) $user['id']);
    $tapBase64 = isset($request['tap']) ? (string) $request['tap'] : '';
    $tap = base64_decode($tapBase64, true);
    if (!is_string($tap)) {
        api_error('A generated TAP file is required.');
    }
    validate_tap($tap);
    $statement = beta_db()->prepare(
        'SELECT COALESCE(SUM(project_bytes + tap_bytes), 0) FROM projects WHERE user_id = ?'
    );
    $statement->execute([(int) $user['id']]);
    $currentBytes = (int) $statement->fetchColumn();
    if (
        $currentBytes - (int) $record['tap_bytes'] + strlen($tap) >
        (int) beta_config()['max_user_storage_bytes']
    ) {
        api_error('Your cloud storage allowance has been reached.', 409);
    }
    $slug = $record['slug'] ?: random_slug();
    $tapPath = tap_relative_path($slug);
    atomic_write(private_path($tapPath), $tap);
    $now = gmdate('c');
    $statement = beta_db()->prepare(
        'UPDATE projects
         SET slug = ?, is_published = 1, tap_path = ?, tap_bytes = ?,
             published_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ?'
    );
    $statement->execute([
        $slug,
        $tapPath,
        strlen($tap),
        $now,
        $now,
        $record['id'],
        (int) $user['id'],
    ]);
    $updated = project_record((string) $record['id'], (int) $user['id']);
    json_response(['ok' => true, 'project' => project_summary($updated)]);
}

if ($action === 'unpublish-project') {
    require_method('POST');
    require_csrf();
    $user = current_user();
    $request = request_json();
    $record = project_record((string) ($request['id'] ?? ''), (int) $user['id']);
    if (!empty($record['tap_path'])) {
        @unlink(private_path((string) $record['tap_path']));
    }
    $statement = beta_db()->prepare(
        'UPDATE projects
         SET is_published = 0, tap_path = NULL, tap_bytes = 0, published_at = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?'
    );
    $statement->execute([gmdate('c'), $record['id'], (int) $user['id']]);
    $updated = project_record((string) $record['id'], (int) $user['id']);
    json_response(['ok' => true, 'project' => project_summary($updated)]);
}

if ($action === 'public-project') {
    require_method('GET');
    $slug = (string) ($_GET['slug'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{12}$/', $slug)) {
        api_error('Invalid shared project link.', 404);
    }
    $statement = beta_db()->prepare(
        'SELECT p.*, u.display_name AS owner_name
         FROM projects p JOIN users u ON u.id = p.user_id
         WHERE p.slug = ? AND p.is_published = 1 AND u.status = "active"'
    );
    $statement->execute([$slug]);
    $record = $statement->fetch();
    if (!$record) {
        api_error('Shared project not found.', 404);
    }
    json_response([
        'ok' => true,
        'project' => load_project_json($record),
        'meta' => [
            'type' => ($record['project_type'] ?? 'graphics') === 'assembler'
                ? 'assembler'
                : 'graphics',
            'name' => $record['name'],
            'owner' => $record['owner_name'],
            'tapUrl' => beta_config()['base_url'] . '/t/' . $record['slug'] . '.tap',
            'updatedAt' => $record['updated_at'],
        ],
    ]);
}

if ($action === 'admin-summary') {
    require_method('GET');
    require_admin();
    $pdo = beta_db();
    $users = $pdo->query(
        'SELECT u.id, u.email, u.display_name, u.picture_url, u.role, u.status,
                u.created_at, u.last_login_at,
                COUNT(p.id) AS project_count,
                COALESCE(SUM(p.project_bytes + p.tap_bytes), 0) AS storage_bytes
         FROM users u LEFT JOIN projects p ON p.user_id = u.id
         GROUP BY u.id ORDER BY u.created_at DESC'
    )->fetchAll();
    $projects = $pdo->query(
        'SELECT p.*, u.email AS owner_email, u.display_name AS owner_name
         FROM projects p JOIN users u ON u.id = p.user_id
         ORDER BY p.updated_at DESC LIMIT 200'
    )->fetchAll();
    json_response([
        'ok' => true,
        'users' => array_map(static fn(array $row): array => [
            'id' => (int) $row['id'],
            'email' => $row['email'],
            'name' => $row['display_name'],
            'picture' => $row['picture_url'],
            'role' => $row['role'],
            'status' => $row['status'],
            'projectCount' => (int) $row['project_count'],
            'storageBytes' => (int) $row['storage_bytes'],
            'createdAt' => $row['created_at'],
            'lastLoginAt' => $row['last_login_at'],
        ], $users),
        'projects' => array_map(static fn(array $row): array => array_merge(
            project_summary($row),
            ['ownerEmail' => $row['owner_email'], 'ownerName' => $row['owner_name']]
        ), $projects),
    ]);
}

if ($action === 'admin-user-status') {
    require_method('POST');
    require_csrf();
    $admin = require_admin();
    $request = request_json();
    $userId = (int) ($request['userId'] ?? 0);
    $status = ($request['status'] ?? '') === 'disabled' ? 'disabled' : 'active';
    if ($userId === (int) $admin['id']) {
        api_error('You cannot disable your own administrator account.');
    }
    $statement = beta_db()->prepare('UPDATE users SET status = ? WHERE id = ?');
    $statement->execute([$status, $userId]);
    json_response(['ok' => true]);
}

if ($action === 'admin-delete-project') {
    require_method('POST');
    require_csrf();
    require_admin();
    $request = request_json();
    $projectId = (string) ($request['id'] ?? '');
    if (!preg_match('/^[a-f0-9]{32}$/', $projectId)) {
        api_error('Invalid project ID.');
    }
    $statement = beta_db()->prepare('SELECT * FROM projects WHERE id = ?');
    $statement->execute([$projectId]);
    $record = $statement->fetch();
    if (!$record) {
        api_error('Project not found.', 404);
    }
    beta_db()->prepare('DELETE FROM projects WHERE id = ?')->execute([$projectId]);
    delete_project_files($record);
    json_response(['ok' => true]);
}

api_error('Unknown API action.', 404);
