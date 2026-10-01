import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const FILE = path.join(DATA_DIR, 'state.json');
const KEEP_SEEN_MS = 7 * 24 * 3600 * 1000;

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { seen: {}, pending: {}, history: [], telegramOffset: 0 };
  }
}

let state = load();

function save() {
  const now = Date.now();
  for (const [k, t] of Object.entries(state.seen)) if (now - t > KEEP_SEEN_MS) delete state.seen[k];
  state.history = state.history.slice(-200);
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(state, null, 2));
  fs.renameSync(FILE + '.tmp', FILE);
}

export const linkKey = (url) => {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '').toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
};

export const store = {
  isSeen: (url) => Boolean(state.seen[linkKey(url)]),
  markSeen(url) {
    state.seen[linkKey(url)] = Date.now();
    save();
  },
  addPending(item) {
    state.pending[item.id] = item;
    save();
  },
  getPending: (id) => state.pending[id],
  removePending(id) {
    delete state.pending[id];
    save();
  },
  addHistory(entry) {
    state.history.push({ ...entry, at: new Date().toISOString() });
    save();
  },
  telegramOffset: () => state.telegramOffset || 0,
  setTelegramOffset(n) {
    state.telegramOffset = n;
    save();
  },
  recentTitles: (n = 30) => state.history.slice(-n).map((h) => h.title),
};
