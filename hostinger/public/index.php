<?php
declare(strict_types=1);

// State API used by the GitHub Actions job.
// Every call needs:  Authorization: Bearer <api_token>
//   GET  ?action=health
//   POST ?action=filter_unseen   {"links": [...]}            → {"unseen": [...]}
//   POST ?action=mark_seen       {"link": "..."}
//   GET  ?action=recent_titles&n=30                          → {"titles": [...]}
//   POST ?action=history_add     {"title","link","status","fb"}
//   POST ?action=pending_add     {"id","title","link","source","caption","sensitivity":{"level","reasons"},"image_base64"}
//   POST ?action=set_webhook     → points the Telegram bot at telegram.php on this host

require __DIR__ . '/lib.php';

$c = cfg();
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if ($auth === '' && function_exists('getallheaders')) {
    foreach (getallheaders() as $k => $v) {
        if (strcasecmp($k, 'Authorization') === 0) {
            $auth = $v;
        }
    }
}
$token = preg_replace('/^Bearer\s+/i', '', $auth);
if (empty($c['api_token']) || $c['api_token'] === 'CHANGE_ME' || !hash_equals($c['api_token'], (string) $token)) {
    json_out(['error' => 'unauthorized'], 401);
}

$action = $_GET['action'] ?? '';
$in = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];

try {
    switch ($action) {
        case 'health':
            db()->query('SELECT 1 FROM pending LIMIT 1');
            json_out(['ok' => true, 'pending' => (int) db()->query("SELECT COUNT(*) FROM pending")->fetchColumn()]);

        case 'filter_unseen':
            $links = array_values(array_filter((array) ($in['links'] ?? []), 'is_string'));
            if (!$links) {
                json_out(['unseen' => []]);
            }
            $keys = array_map('link_key', $links);
            $seen = [];
            foreach (array_chunk(array_unique($keys), 200) as $chunk) {
                $st = db()->prepare('SELECT link_key FROM seen WHERE link_key IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
                $st->execute($chunk);
                foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $k) {
                    $seen[$k] = true;
                }
            }
            $unseen = [];
            foreach ($links as $i => $l) {
                if (!isset($seen[$keys[$i]])) {
                    $unseen[] = $l;
                }
            }
            json_out(['unseen' => $unseen]);

        case 'mark_seen':
            $link = (string) ($in['link'] ?? '');
            if ($link === '') {
                json_out(['error' => 'link required'], 400);
            }
            $sql = is_mysql()
                ? 'INSERT IGNORE INTO seen (link_key) VALUES (?)'
                : 'INSERT OR IGNORE INTO seen (link_key) VALUES (?)';
            db()->prepare($sql)->execute([link_key($link)]);
            // keep the table small: forget links older than 14 days
            db()->exec(is_mysql()
                ? 'DELETE FROM seen WHERE seen_at < NOW() - INTERVAL 14 DAY'
                : "DELETE FROM seen WHERE seen_at < datetime('now', '-14 days')");
            json_out(['ok' => true]);

        case 'recent_titles':
            $n = max(1, min(100, (int) ($_GET['n'] ?? 30)));
            $st = db()->query("SELECT title FROM history ORDER BY id DESC LIMIT $n");
            json_out(['titles' => array_reverse($st->fetchAll(PDO::FETCH_COLUMN))]);

        case 'history_add':
            add_history((string) ($in['title'] ?? ''), (string) ($in['link'] ?? ''), (string) ($in['status'] ?? ''), $in['fb'] ?? null);
            json_out(['ok' => true]);

        case 'pending_add':
            $png = base64_decode((string) ($in['image_base64'] ?? ''), true);
            if (!$png || !preg_match('/^[a-f0-9]{6,32}$/', (string) ($in['id'] ?? ''))) {
                json_out(['error' => 'id and image_base64 required'], 400);
            }
            db()->prepare('INSERT INTO pending (id, title, link, source, caption, sensitivity_level, sensitivity_reasons, image)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([
                    $in['id'],
                    mb_substr((string) ($in['title'] ?? ''), 0, 500),
                    mb_substr((string) ($in['link'] ?? ''), 0, 1000),
                    mb_substr((string) ($in['source'] ?? ''), 0, 100),
                    (string) ($in['caption'] ?? ''),
                    (string) ($in['sensitivity']['level'] ?? ''),
                    (string) ($in['sensitivity']['reasons'] ?? ''),
                    $png,
                ]);
            json_out(['ok' => true]);

        case 'set_webhook':
            $url = 'https://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/telegram.php';
            $res = tg('setWebhook', [
                'url' => $url,
                'secret_token' => $c['telegram_webhook_secret'],
                'allowed_updates' => ['callback_query'],
                'drop_pending_updates' => 'true',
            ]);
            json_out(['webhook' => $url, 'telegram' => $res]);

        default:
            json_out(['error' => 'unknown action'], 404);
    }
} catch (Throwable $e) {
    error_log('[fastscore] ' . $e->getMessage());
    json_out(['error' => 'server error'], 500);
}
