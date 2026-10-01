import cron from 'node-cron';
import { config, log } from './config.js';
import { store } from './store.js';
import { runOnce, handleDecision } from './run.js';
import { startPolling, processDecisionsOnce } from './telegram.js';

let running = false;
async function cycle() {
  if (running) return log('[cron] previous run still going, skipped');
  running = true;
  try {
    await runOnce();
  } catch (e) {
    log('[cron] run failed', e.message);
    process.exitCode = 1;
  } finally {
    running = false;
  }
}

const arg = (a) => process.argv.includes(a);
// With the Hostinger API, Approve / Reject is handled instantly by telegram.php (webhook),
// so this process never reads Telegram updates itself.
const localReview = !store.remote;

if (arg('--health')) {
  if (!store.remote) log('STATE_API_URL not set — using local file');
  else log('[store] API ok:', JSON.stringify(await store.health()));
} else if (arg('--decisions')) {
  if (localReview) await processDecisionsOnce(handleDecision);
  else log('Review decisions are handled by the Hostinger webhook — nothing to do');
} else if (arg('--once')) {
  if (localReview) await processDecisionsOnce(handleDecision).catch((e) => log('[telegram]', e.message));
  await cycle();
} else {
  // Always-on server: built-in schedule (+ Telegram polling when there is no webhook)
  if (!cron.validate(config.cron)) throw new Error(`Invalid CRON_SCHEDULE: ${config.cron}`);
  cron.schedule(config.cron, cycle, { timezone: config.timezone });
  log(`Scheduled "${config.cron}" (${config.timezone})${config.dryRun ? ' — DRY RUN' : ''}`);
  if (localReview) startPolling(handleDecision);
  if (config.runOnStart) cycle();
}
