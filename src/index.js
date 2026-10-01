import cron from 'node-cron';
import { config, log } from './config.js';
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

if (arg('--decisions')) {
  // GitHub Actions: only act on Telegram Approve / Reject presses, then exit.
  await processDecisionsOnce(handleDecision);
} else if (arg('--once')) {
  // GitHub Actions / manual: handle pending decisions, run one cycle, exit.
  await processDecisionsOnce(handleDecision).catch((e) => log('[telegram]', e.message));
  await cycle();
} else {
  // Always-on server: built-in schedule + live Telegram polling.
  if (!cron.validate(config.cron)) throw new Error(`Invalid CRON_SCHEDULE: ${config.cron}`);
  cron.schedule(config.cron, cycle, { timezone: config.timezone });
  log(`Scheduled "${config.cron}" (${config.timezone})${config.dryRun ? ' — DRY RUN' : ''}`);
  startPolling(handleDecision);
  if (config.runOnStart) cycle();
}
