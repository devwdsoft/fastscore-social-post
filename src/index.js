import cron from 'node-cron';
import { config, log, telegramEnabled } from './config.js';
import { runOnce, handleDecision } from './run.js';
import { startPolling } from './telegram.js';

let running = false;
async function cycle() {
  if (running) return log('[cron] previous run still going, skipped');
  running = true;
  try {
    await runOnce();
  } catch (e) {
    log('[cron] run failed', e.message);
  } finally {
    running = false;
  }
}

if (process.argv.includes('--once')) {
  await cycle();
  if (!telegramEnabled()) process.exit(0);
  log('Run finished. Keeping the Telegram review bot alive — press Ctrl+C to stop.');
  startPolling(handleDecision);
} else {
  if (!cron.validate(config.cron)) throw new Error(`Invalid CRON_SCHEDULE: ${config.cron}`);
  cron.schedule(config.cron, cycle, { timezone: config.timezone });
  log(`Scheduled "${config.cron}" (${config.timezone})${config.dryRun ? ' — DRY RUN' : ''}`);
  startPolling(handleDecision);
  if (config.runOnStart) cycle();
}
