import { config } from './config.js';

/** Publish a photo post on the Page. Returns { id, post_id }. */
export async function postPhoto({ png, caption }) {
  const { pageId, token, version } = config.facebook;
  if (!pageId || !token) throw new Error('FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN missing');
  const form = new FormData();
  form.append('source', new Blob([png], { type: 'image/png' }), 'post.png');
  form.append('message', caption);
  form.append('published', 'true');
  form.append('access_token', token);
  const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/photos`, { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`Facebook: ${json.error?.message || res.status}`);
  return json;
}

export const postUrl = (r) => `https://www.facebook.com/${r.post_id || r.id}`;
