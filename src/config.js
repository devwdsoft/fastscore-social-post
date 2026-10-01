import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const OUT_DIR = path.join(DATA_DIR, 'out');
export const PENDING_DIR = path.join(DATA_DIR, 'pending');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(PENDING_DIR, { recursive: true });

const env = (k, d = '') => (process.env[k] ?? '').trim() || d;
const bool = (k, d) => {
  const v = env(k, '');
  return v === '' ? d : /^(1|true|yes|on)$/i.test(v);
};
const num = (k, d) => {
  const v = Number(env(k, ''));
  return Number.isFinite(v) && env(k, '') !== '' ? v : d;
};

export const config = {
  openai: { apiKey: env('OPENAI_API_KEY'), model: env('OPENAI_MODEL', 'gpt-4.1-mini') },
  facebook: {
    pageId: env('FB_PAGE_ID'),
    token: env('FB_PAGE_ACCESS_TOKEN'),
    version: env('FB_GRAPH_VERSION', 'v21.0'),
  },
  // PHP + MySQL state API on Hostinger (leave empty to use data/state.json)
  stateApi: { url: env('STATE_API_URL'), token: env('STATE_API_TOKEN') },
  telegram: {
    token: env('TELEGRAM_BOT_TOKEN'),
    chatId: env('TELEGRAM_CHAT_ID'),
    notifyPosted: bool('TELEGRAM_NOTIFY_POSTED', true),
  },
  cron: env('CRON_SCHEDULE', '5 */3 * * *'),
  timezone: env('TIMEZONE', 'Asia/Ho_Chi_Minh'),
  runOnStart: bool('RUN_ON_START', false),
  postsPerRun: num('POSTS_PER_RUN', 1),
  minScore: num('MIN_SCORE', 7),
  maxAgeHours: num('MAX_AGE_HOURS', 12),
  reviewLevel: env('REVIEW_LEVEL', 'high').toLowerCase(),
  brand: {
    name: env('BRAND_NAME', 'FAST SCORE'),
    color: env('BRAND_COLOR', '#1B7700'),
    hashtag: env('HASHTAG', '#fastscore'),
    icon: env('APP_ICON', 'assets/app-icon.png'),
  },
  sourceCredit: bool('SOURCE_CREDIT', true),
  dryRun: bool('DRY_RUN', false),
  chromiumPath: env('CHROMIUM_PATH'),
  feeds: JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'feeds.json'), 'utf8')),
};

export const telegramEnabled = () => Boolean(config.telegram.token && config.telegram.chatId);

const LEVELS = ['low', 'medium', 'high'];
export const levelRank = (l) => Math.max(0, LEVELS.indexOf(String(l).toLowerCase()));
export const needsReview = (level) => levelRank(level) >= levelRank(config.reviewLevel);

export const log = (...a) => console.log(new Date().toISOString(), ...a);
