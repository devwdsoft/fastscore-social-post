<?php
declare(strict_types=1);

// Shared helpers for index.php (state API) and telegram.php (review webhook).

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'lib.php') {
    http_response_code(404);
    exit;
}

function cfg(): array
{
    static $c = null;
    if ($c === null) {
        // Look for social/fastscore-config.php (or social/config.php) next to this folder
        // and up to 4 levels above it, so it works whether the subdomain lives in
        // public_html/ itself or in a sub-folder such as public_html/api/.
        $candidates = [getenv('FASTSCORE_CONFIG') ?: ''];
        $dir = __DIR__;
        for ($i = 0; $i < 5; $i++) {
            $candidates[] = $dir . '/../../social/fastscore-config.php';
            $candidates[] = $dir . '/../../social/config.php';
            $parent = dirname($dir);
            if ($parent === $dir) {
                break;
            }
            $dir = $parent;
        }
        foreach ($candidates as $f) {
            if ($f !== '' && @is_file($f)) {
                $c = require $f;
                break;
            }
        }
        if (!is_array($c)) {
            error_log('[fastscore] config not found, looked in: ' . implode(', ', array_filter($candidates)));
        }
        if (!is_array($c)) {
            json_out(['error' => 'config file not found'], 500);
        }
    }
    return $c;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = cfg();
        $dsn = $c['db_dsn'] ?? sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['db_host'], $c['db_name']);
        $pdo = new PDO($dsn, $c['db_user'] ?? null, $c['db_pass'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

function is_mysql(): bool
{
    return db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
}

function json_out($data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function link_key(string $url): string
{
    $p = parse_url($url);
    if (!$p || empty($p['host'])) {
        return strtolower(substr($url, 0, 255));
    }
    $key = preg_replace('/^www\./', '', $p['host']) . rtrim($p['path'] ?? '', '/');
    return strtolower(substr($key, 0, 255));
}

function add_history(string $title, string $link, string $status, ?string $fbUrl = null): void
{
    db()->prepare('INSERT INTO history (title, link, status, fb_url) VALUES (?, ?, ?, ?)')
        ->execute([mb_substr($title, 0, 500), mb_substr($link, 0, 1000), $status, $fbUrl]);
}

function http_post(string $url, array $fields, bool $multipart = false): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $multipart ? $fields : http_build_query($fields),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
    ]);
    $body = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($body === false) {
        throw new RuntimeException("HTTP error: $err");
    }
    $json = json_decode((string) $body, true);
    return is_array($json) ? $json : ['raw' => $body];
}

function tg(string $method, array $params): array
{
    $token = cfg()['telegram_bot_token'];
    foreach ($params as $k => $v) {
        if (is_array($v)) {
            $params[$k] = json_encode($v, JSON_UNESCAPED_UNICODE);
        }
    }
    return http_post("https://api.telegram.org/bot{$token}/{$method}", $params);
}

/** Publish a PNG + caption on the Facebook Page. Returns the post URL. */
function fb_post_photo(string $png, string $caption): string
{
    $c = cfg();
    $tmp = tempnam(sys_get_temp_dir(), 'fs') . '.png';
    file_put_contents($tmp, $png);
    try {
        $res = http_post(
            sprintf('https://graph.facebook.com/%s/%s/photos', $c['fb_graph_version'] ?? 'v21.0', $c['fb_page_id']),
            [
                'source' => new CURLFile($tmp, 'image/png', 'post.png'),
                'message' => $caption,
                'published' => 'true',
                'access_token' => $c['fb_page_token'],
            ],
            true
        );
    } finally {
        @unlink($tmp);
    }
    if (!empty($res['error']) || empty($res['id'])) {
        throw new RuntimeException('Facebook: ' . ($res['error']['message'] ?? json_encode($res)));
    }
    return 'https://www.facebook.com/' . ($res['post_id'] ?? $res['id']);
}
