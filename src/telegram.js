import { config, log, telegramEnabled } from './config.js';
import { store } from './store.js';

const api = async (method, body) => {
  const url = `https://api.telegram.org/bot${config.telegram.token}/${method}`;
  const res = await fetch(url, body instanceof FormData ? { method: 'POST', body } : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
};

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export async function sendForReview(p) {
  const form = new FormData();
  form.append('chat_id', config.telegram.chatId);
  form.append('photo', new Blob([p.png], { type: 'image/png' }), 'post.png');
  form.append('caption', cut(`⚠️ NEEDS REVIEW — sensitivity: ${p.sensitivity.level.toUpperCase()}\n${p.sensitivity.reasons}\n\n${p.link}`, 1024));
  await api('sendPhoto', form);
  await api('sendMessage', {
    chat_id: config.telegram.chatId,
    text: cut(p.caption, 4000),
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Approve & post', callback_data: `approve:${p.id}` },
        { text: '❌ Reject', callback_data: `reject:${p.id}` },
      ]],
    },
  });
}

/** Dry run: show what would have been posted, without buttons. */
export async function sendPreview(p) {
  if (!telegramEnabled()) return;
  const form = new FormData();
  form.append('chat_id', config.telegram.chatId);
  form.append('photo', new Blob([p.png], { type: 'image/png' }), 'post.png');
  form.append('caption', cut(`🧪 DRY RUN — not posted\nsensitivity: ${p.sensitivity.level.toUpperCase()} → ${p.review ? 'would need review' : 'would auto-post'}\n${p.sensitivity.reasons}\n\n${p.link}`, 1024));
  await api('sendPhoto', form);
  await api('sendMessage', { chat_id: config.telegram.chatId, text: cut(p.caption, 4000), disable_web_page_preview: true });
}

export const notify = (text) =>
  telegramEnabled() ? api('sendMessage', { chat_id: config.telegram.chatId, text: cut(text, 4000), disable_web_page_preview: true }).catch((e) => log(e.message)) : null;

async function handleUpdates(updates, onDecision) {
  let next = null;
  for (const u of updates) {
    next = u.update_id + 1;
    const q = u.callback_query;
    if (!q?.data) continue;
    if (String(q.message?.chat?.id) !== String(config.telegram.chatId)) continue;
    const [action, id] = q.data.split(':');
    let reply;
    try {
      reply = await onDecision(action, id);
    } catch (e) {
      reply = `Error: ${e.message}`;
    }
    await api('answerCallbackQuery', { callback_query_id: q.id, text: cut(reply, 190) }).catch(() => {});
    await api('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    await notify(reply);
  }
  if (next !== null) store.setTelegramOffset(next);
}

/** Process Approve / Reject presses received since the last check, then return (GitHub Actions). */
export async function processDecisionsOnce(onDecision) {
  if (!telegramEnabled()) return;
  const updates = await api('getUpdates', { offset: store.telegramOffset(), timeout: 0, allowed_updates: ['callback_query'] });
  log(`[telegram] ${updates.length} update(s) to process`);
  await handleUpdates(updates, onDecision);
}

/** Long-poll Telegram for Approve / Reject presses (always-on server mode). */
export async function startPolling(onDecision) {
  if (!telegramEnabled()) return;
  log('[telegram] polling for review decisions');
  for (;;) {
    try {
      const updates = await api('getUpdates', { offset: store.telegramOffset(), timeout: 30, allowed_updates: ['callback_query'] });
      await handleUpdates(updates, onDecision);
    } catch (e) {
      log('[telegram] poll error', e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
