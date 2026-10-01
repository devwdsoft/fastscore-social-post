import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, log, needsReview, telegramEnabled, OUT_DIR } from './config.js';
import { store } from './store.js';
import { fetchCandidates } from './feeds.js';
import { fetchArticle, downloadImage } from './article.js';
import { selectStories, writePost } from './ai.js';
import { renderCard } from './render.js';
import { postPhoto, postUrl } from './facebook.js';
import { sendForReview, sendPreview, notify } from './telegram.js';

function finalCaption(text, source) {
  let t = text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
  if (!t.toLowerCase().includes(config.brand.hashtag.toLowerCase())) t += `\n\n${config.brand.hashtag}`;
  if (config.sourceCredit && source) t += `\n\nSource: ${source}`;
  return t;
}

async function publish(p, png) {
  const res = await postPhoto({ png, caption: p.caption });
  const url = postUrl(res);
  await store.addHistory({ title: p.title, link: p.link, status: 'posted', fb: url });
  log(`[facebook] posted ${url}`);
  return url;
}

/** Approve / reject handler for the local Telegram polling mode (with the Hostinger API, telegram.php does this). */
export async function handleDecision(action, id) {
  const p = store.getPending(id);
  if (!p) return 'This draft is no longer pending.';
  if (action === 'approve') {
    const url = config.dryRun ? 'dry-run (not posted)' : await publish(p, store.pendingImage(p)); // throws → stays pending
    store.removePending(id);
    return `✅ Posted: ${url}`;
  }
  store.removePending(id);
  await store.addHistory({ title: p.title, link: p.link, status: 'rejected' });
  return `❌ Rejected: ${p.title}`;
}

/** One full cycle: fetch → pick → write → render → post or send for review. */
export async function runOnce() {
  if (!config.openai.apiKey) throw new Error('OPENAI_API_KEY missing');
  const candidates = (await fetchCandidates()).slice(0, 60);
  if (!candidates.length) return log('[run] nothing new');

  const picks = (await selectStories(candidates, await store.recentTitles(), config.postsPerRun))
    .filter((p) => p.score >= config.minScore)
    .slice(0, config.postsPerRun);
  if (!picks.length) return log('[run] no story scored high enough');

  for (const pick of picks) {
    const item = candidates[pick.index];
    // A dry run leaves no trace, so the same story can still be posted for real later.
    if (!config.dryRun) await store.markSeen(item.link);
    log(`[run] ${pick.score}/10 ${item.title}`);
    try {
      const article = await fetchArticle(item.link);
      const imageDataUri = await downloadImage(article.ogImage || item.imageUrl);
      const content = await writePost({ ...item, text: article.text });

      const id = crypto.randomBytes(5).toString('hex');
      const pngFile = path.join(OUT_DIR, `${new Date().toISOString().slice(0, 10)}-${id}.png`);
      const png = await renderCard({ card: content.card, imageDataUri, outFile: pngFile });
      const p = {
        id,
        title: item.title,
        link: item.link,
        source: item.source,
        caption: finalCaption(content.post_text, item.source),
        sensitivity: content.sensitivity,
      };
      if (!store.remote) fs.writeFileSync(pngFile.replace(/\.png$/, '.json'), JSON.stringify({ ...p, card: content.card }, null, 2));
      const review = needsReview(p.sensitivity.level);
      log(`[run] sensitivity=${p.sensitivity.level} → ${review ? 'review' : 'auto-post'}`);

      if (config.dryRun) {
        log('[dry-run] not posted');
        await sendPreview({ ...p, png, review });
      } else if (review) {
        if (!telegramEnabled()) {
          log('[run] needs review but Telegram is not configured — held, not posted');
          await store.addHistory({ title: p.title, link: p.link, status: 'held' });
          continue;
        }
        await store.addPending(p, png);
        await sendForReview({ ...p, png });
        log('[run] sent to Telegram for review');
      } else {
        const url = await publish(p, png);
        if (config.telegram.notifyPosted) await notify(`📣 Auto-posted (${p.sensitivity.level}): ${p.title}\n${url}`);
      }
    } catch (e) {
      log('[run] failed for', item.link, e.message);
      process.exitCode = 1;
      await notify(`⚠️ Fast Score autopost error: ${e.message}\n${item.link}`);
    }
  }
}
