import Parser from 'rss-parser';
import { config, log } from './config.js';
import { store } from './store.js';

const parser = new Parser({
  timeout: 20000,
  headers: { 'User-Agent': 'Mozilla/5.0 (FastScoreBot/1.0)' },
  customFields: { item: [['media:content', 'mediaContent', { keepArray: true }], ['media:thumbnail', 'mediaThumb']] },
});

const strip = (s = '') => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function pickImage(item) {
  const media = (item.mediaContent || [])
    .map((m) => m?.$)
    .filter((m) => m?.url)
    .sort((a, b) => Number(b.width || 0) - Number(a.width || 0));
  return media[0]?.url || item.mediaThumb?.$?.url || item.enclosure?.url || null;
}

/** Fetch every feed and return fresh, unseen items, newest first. */
export async function fetchCandidates() {
  const cutoff = Date.now() - config.maxAgeHours * 3600 * 1000;
  const results = await Promise.allSettled(config.feeds.map((f) => parser.parseURL(f.url).then((feed) => ({ f, feed }))));
  const items = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') {
      log('[feeds] failed:', r.reason?.message);
      continue;
    }
    const { f, feed } = r.value;
    for (const it of feed.items || []) {
      if (!it.link || !it.title) continue;
      const published = new Date(it.isoDate || it.pubDate || Date.now()).getTime();
      if (published < cutoff) continue;
      items.push({
        title: strip(it.title),
        link: it.link,
        summary: strip(it.contentSnippet || it.content || it.summary || '').slice(0, 400),
        source: f.name,
        published,
        imageUrl: pickImage(it),
      });
    }
  }
  const unseen = new Set(await store.filterUnseen(items.map((i) => i.link)));
  const fresh = items.filter((i) => unseen.has(i.link)).sort((a, b) => b.published - a.published);
  log(`[feeds] ${fresh.length} fresh items`);
  return fresh;
}
