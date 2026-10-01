<?php
declare(strict_types=1);

// Telegram webhook: handles the Approve / Reject buttons on review drafts.
// Set it up once with:  POST index.php?action=set_webhook

require __DIR__ . '/lib.php';

$c = cfg();
$secret = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
if (empty($c['telegram_webhook_secret']) || $c['telegram_webhook_secret'] === 'CHANGE_ME'
    || !hash_equals($c['telegram_webhook_secret'], $secret)) {
    http_response_code(403);
    exit;
}

$update = json_decode(file_get_contents('php://input') ?: '', true);
$q = $update['callback_query'] ?? null;
// Always answer 200 so Telegram does not retry; the work below is idempotent anyway.
if (!$q || empty($q['data']) || (string) ($q['message']['chat']['id'] ?? '') !== (string) $c['telegram_chat_id']) {
    exit;
}

[$action, $id] = array_pad(explode(':', (string) $q['data'], 2), 2, '');
$reply = '';

try {
    // Claim the draft so a double click or a Telegram retry cannot post it twice.
    $claim = db()->prepare("UPDATE pending SET status = 'processing' WHERE id = ? AND status = 'pending'");
    $claim->execute([$id]);
    if ($claim->rowCount() === 0) {
        $reply = 'This draft was already handled.';
    } else {
        $st = db()->prepare('SELECT * FROM pending WHERE id = ?');
        $st->execute([$id]);
        $p = $st->fetch();

        if ($action === 'approve') {
            try {
                if (!empty($c['dry_run'])) {
                    $url = 'dry-run (not posted)';
                } else {
                    $url = fb_post_photo($p['image'], $p['caption']);
                    add_history($p['title'], $p['link'], 'posted', $url);
                }
                db()->prepare('DELETE FROM pending WHERE id = ?')->execute([$id]);
                $reply = "✅ Posted: $url";
            } catch (Throwable $e) {
                db()->prepare("UPDATE pending SET status = 'pending' WHERE id = ?")->execute([$id]);
                throw $e;
            }
        } else {
            db()->prepare('DELETE FROM pending WHERE id = ?')->execute([$id]);
            add_history($p['title'], $p['link'], 'rejected');
            $reply = '❌ Rejected: ' . $p['title'];
        }
    }
} catch (Throwable $e) {
    error_log('[fastscore] ' . $e->getMessage());
    $reply = '⚠️ Error: ' . $e->getMessage() . ' (draft kept, you can press Approve again)';
}

try {
    tg('answerCallbackQuery', ['callback_query_id' => $q['id'], 'text' => mb_substr($reply, 0, 190)]);
    if (!str_starts_with($reply, '⚠️')) {
        tg('editMessageReplyMarkup', [
            'chat_id' => $q['message']['chat']['id'],
            'message_id' => $q['message']['message_id'],
            'reply_markup' => ['inline_keyboard' => []],
        ]);
    }
    tg('sendMessage', ['chat_id' => $c['telegram_chat_id'], 'text' => $reply, 'disable_web_page_preview' => 'true']);
} catch (Throwable $e) {
    error_log('[fastscore] telegram reply failed: ' . $e->getMessage());
}
