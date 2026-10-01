import fs from 'node:fs';
import path from 'node:path';
import { config, DATA_DIR, PENDING_DIR, log } from './config.js';

// Two interchangeable backends with the same async interface:
//  - apiStore:  the PHP + MySQL API on Hostinger (set STATE_API_URL + STATE_API_TOKEN). Used on GitHub Actions.
//  - fileStore: data/state.json on local disk. Used when running on your own PC / VPS.

export const linkKey = (url) => {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '').toLowerCase().slice(0, 255);
  } catch {
    return String(url).toLowerCase().slice(0, 255);
  }
};

// ---------- Remote API (Hostinger) ----------

async function call(action, body, query = '') {
  const res = await fetch(`${config.stateApi.url}?action=${action}${query}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${config.stateApi.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(`State API ${action}: ${json.error || res.status}`);
  return json;
}

const apiStore = {
  remote: true,
  async filterUnseen(links) {
    return (await call('filter_unseen', { links })).unseen;
  },
  markSeen: (link) => call('mark_seen', { link }),
  async recentTitles(n = 30) {
    return (await call('recent_titles', null, `&n=${n}`)).titles;
  },
  addHistory: (e) => call('history_add', e),
  addPending: (p, png) =>
    call('pending_add', {
      id: p.id,
      title: p.title,
      link: p.link,
      source: p.source,
      caption: p.caption,
      sensitivity: p.sensitivity,
      image_base64: png.toString('base64'),
    }),
  health: () => call('health'),
};

// ---------- Local file ----------

const FILE = path.join(DATA_DIR, 'state.json');
const KEEP_SEEN_MS = 14 * 24 * 3600 * 1000;
let state;

function load() {
  try {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    state = { seen: {}, pending: {}, history: [], telegramOffset: 0 };
  }
}

function save() {
  const now = Date.now();
  for (const [k, t] of Object.entries(state.seen)) if (now - t > KEEP_SEEN_MS) delete state.seen[k];
  state.history = state.history.slice(-200);
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(state, null, 2));
  fs.renameSync(FILE + '.tmp', FILE);
}

const fileStore = {
  remote: false,
  async filterUnseen(links) {
    return links.filter((l) => !state.seen[linkKey(l)]);
  },
  async markSeen(link) {
    state.seen[linkKey(link)] = Date.now();
    save();
  },
  async recentTitles(n = 30) {
    return state.history.slice(-n).map((h) => h.title);
  },
  async addHistory(e) {
    state.history.push({ ...e, at: new Date().toISOString() });
    save();
  },
  async addPending(p, png) {
    const file = path.join(PENDING_DIR, `${p.id}.png`);
    fs.writeFileSync(file, png);
    state.pending[p.id] = { ...p, pngFile: path.relative(DATA_DIR, file) };
    save();
  },
  // Used only by the local Telegram polling mode
  getPending: (id) => state.pending[id],
  pendingImage: (p) => fs.readFileSync(path.resolve(DATA_DIR, p.pngFile)),
  removePending(id) {
    const p = state.pending[id];
    if (p) fs.rmSync(path.resolve(DATA_DIR, p.pngFile), { force: true });
    delete state.pending[id];
    save();
  },
  telegramOffset: () => state.telegramOffset || 0,
  setTelegramOffset(n) {
    state.telegramOffset = n;
    save();
  },
};

export const store = config.stateApi.url ? apiStore : (load(), fileStore);
log(`[store] using ${store.remote ? 'remote state API' : 'local file data/state.json'}`);
