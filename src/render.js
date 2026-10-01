import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { config, ROOT } from './config.js';
import { cardHtml } from './template.js';

/** App icon from APP_ICON as a data URI, or null if the file is missing. */
function appIcon() {
  const file = path.resolve(ROOT, config.brand.icon);
  if (!config.brand.icon || !fs.existsSync(file)) return null;
  const ext = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
  return `data:image/${ext};base64,${fs.readFileSync(file).toString('base64')}`;
}

/** Render the post image to a PNG file. */
export async function renderCard({ card, imageDataUri, outFile }) {
  const browser = await chromium.launch(config.chromiumPath ? { executablePath: config.chromiumPath } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await page.setContent(cardHtml({ card, imageDataUri, brand: { ...config.brand, iconDataUri: appIcon() } }), { waitUntil: 'load', timeout: 30000 }).catch(() => {});
    await page.evaluate(() => window.fitText());
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    fs.writeFileSync(outFile, png);
    return png;
  } finally {
    await browser.close();
  }
}
