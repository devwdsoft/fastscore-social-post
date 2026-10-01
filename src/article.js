import * as cheerio from 'cheerio';
import { log } from './config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Download the article page and pull out its body text and og:image. */
export async function fetchArticle(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const $ = cheerio.load(await res.text());
    const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || null;
    $('script, style, nav, header, footer, aside, figure, noscript').remove();
    const root = $('article').length ? $('article').first() : $('main').length ? $('main').first() : $('body');
    const text = root
      .find('p')
      .map((_, p) => $(p).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((t) => t.length > 40)
      .join('\n')
      .slice(0, 8000);
    return { text, ogImage };
  } catch (e) {
    log('[article] fetch failed', url, e.message);
    return { text: '', ogImage: null };
  }
}

/** Download an image; returns a data URI or null. */
export async function downloadImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) throw new Error(`not an image: ${type}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch (e) {
    log('[article] image download failed', url, e.message);
    return null;
  }
}
