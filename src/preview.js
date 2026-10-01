// Render a sample card without calling OpenAI or Facebook:
//   npm run preview -- path/to/photo.jpg
import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from './config.js';
import { renderCard } from './render.js';

const img = process.argv[2];
const imageDataUri = img ? `data:image/${path.extname(img).slice(1) || 'jpeg'};base64,${fs.readFileSync(img).toString('base64')}` : null;

const card = {
  label: 'Breaking',
  competition: 'Nations League',
  headline_main: 'Ronaldo',
  headline_accent: 'walks out',
  subheadline: "CR7 leaves Portugal's camp in Copenhagen on the eve of the Denmark clash, amid a reported rift with coach Jorge Jesus.",
  quote: { text: 'This is about Denmark, not Ronaldo.', by: 'Jorge Jesus, Portugal coach' },
  stats: [
    { value: '41', label: 'Years old' },
    { value: '146', label: 'International goals' },
    { value: '234', label: 'Caps' },
  ],
  footer: 'Denmark vs Portugal · Thu',
};

const outFile = path.join(OUT_DIR, 'preview.png');
await renderCard({ card, imageDataUri, outFile });
console.log('Saved', outFile);
