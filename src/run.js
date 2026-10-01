import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, log, needsReview, telegramEnabled, OUT_DIR } from './config.js';
import { store } from './store.js';
import { fetchCandidates } from './feeds.js';
import { fetchArticle, downloadImage } from './article.js';
import { selectStories, writePost } from './ai.js';
import { renderCard } from './render.js';
import { postPhoto, postUrl } from './facebook.js';
import { sendForReview, notify } from './telegram.js';

function finalCaption(text, source) {
  let t = text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
  if (!t.toLowerCase().includes(config.brand.hashtag.toLowerCase())) t += `\n\n${config.brand.hashtag}`;
  if (config.sourceCredit && source) t += `\n\nSource: ${source}`;
  return t;
}

async function publish(p) {
  if (config.dryRun) {
    log(`[dry-run] would post: ${p.title} → ${p.pngFile}`);
    return 'dry-run (not posted)';
  }
  const res = await postPhoto({ png: fs.readFileSync(p.pngFile), caption: p.caption });
  const url = postUrl(res);
  store.addHistory({ title: p.title, link: p.link, status: 'posted', fb: url });
  log(`[facebook] posted ${url}`);
  return url;
}

/** Approve / reject handler for Telegram buttons. */
export async function handleDecision(action, id) {
  const p = store.getPending(id);
  if (!p) return 'This draft is no longer pending.';
  store.removePending(id);
  if (action === 'approve') return `✅ Posted: ${await publish(p)}`;
  store.addHistory({ title: p.title, link: p.link, status: 'rejected' });
  return `❌ Rejected: ${p.title}`;
}

/** One full cycle: fetch → pick → write → render → post or send for review. */
export async function runOnce() {
  if (!config.openai.apiKey) throw new Error('OPENAI_API_KEY missing');
  const candidates = (await fetchCandidates()).slice(0, 60);
  if (!candidates.length) return log('[run] nothing new');

  const picks = (await selectStories(candidates, store.recentTitles(), config.postsPerRun))
    .filter((p) => p.score >= config.minScore)
    .slice(0, config.postsPerRun);
  if (!picks.length) return log('[run] no story scored high enough');

  for (const pick of picks) {
    const item = candidates[pick.index];
    store.markSeen(item.link);
    log(`[run] ${pick.score}/10 ${item.title} (${pick.reason})`);
    try {
      const article = await fetchArticle(item.link);
      const imageDataUri = await downloadImage(article.ogImage || item.imageUrl);
      const content = await writePost({ ...item, text: article.text });

      const id = crypto.randomBytes(5).toString('hex');
      const pngFile = path.join(OUT_DIR, `${new Date().toISOString().slice(0, 10)}-${id}.png`);
      await renderCard({ card: content.card, imageDataUri, outFile: pngFile });
      const p = {
        id,
        title: item.title,
        link: item.link,
        source: item.source,
        caption: finalCaption(content.post_text, item.source),
        sensitivity: content.sensitivity,
        pngFile,
      };
      fs.writeFileSync(pngFile.replace(/\.png$/, '.json'), JSON.stringify({ ...p, card: content.card }, null, 2));
      log(`[run] sensitivity=${p.sensitivity.level}: ${p.sensitivity.reasons}`);

      if (needsReview(p.sensitivity.level)) {
        if (!telegramEnabled()) {
          log('[run] needs review but Telegram is not configured — held, not posted:', pngFile);
          store.addHistory({ title: p.title, link: p.link, status: 'held' });
          continue;
        }
        store.addPending(p);
        await sendForReview({ ...p, png: fs.readFileSync(pngFile) });
        log('[run] sent to Telegram for review');
      } else {
        const url = await publish(p);
        if (config.telegram.notifyPosted) await notify(`📣 Auto-posted (${p.sensitivity.level}): ${p.title}\n${url}`);
      }
    } catch (e) {
      log('[run] failed for', item.link, e.stack || e.message);
      await notify(`⚠️ Fast Score autopost error: ${e.message}\n${item.link}`);
    }
  }
}
