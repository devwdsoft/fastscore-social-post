import OpenAI from 'openai';
import { config } from './config.js';

let client;
const openai = () => (client ??= new OpenAI({ apiKey: config.openai.apiKey }));

async function jsonCall(name, schema, system, user) {
  const res = await openai().chat.completions.create({
    model: config.openai.model,
    temperature: 0.6,
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return JSON.parse(res.choices[0].message.content);
}

// ---------- 1. Pick the stories worth posting ----------

const SELECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['picks'],
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'score', 'reason'],
        properties: {
          index: { type: 'integer' },
          score: { type: 'integer', description: '1-10 engagement potential for a football fan page' },
          reason: { type: 'string' },
        },
      },
    },
  },
};

export async function selectStories(candidates, recentTitles, count) {
  const list = candidates
    .map((c, i) => `[${i}] (${c.source}) ${c.title}${c.summary ? ' — ' + c.summary.slice(0, 200) : ''}`)
    .join('\n');
  const system = `You are the social media editor of "Fast Score", a football livescore app with a global, English-speaking Facebook audience.
Pick the stories most likely to drive engagement (big clubs, star players, drama, records, major results, confirmed big transfers).
Football (soccer) stories ONLY: skip other sports (F1, rugby, darts, boxing, NFL...).
Skip: live blogs, minute-by-minute pages, quizzes, podcasts, videos-only pages, opinion columns, betting tips, duplicates of each other, and stories that repeat a recently posted topic.
Score each pick 1-10. Return at most ${count} picks, best first. Return an empty list if nothing is good enough.`;
  const user = `Recently posted (do not repeat these stories):\n${recentTitles.map((t) => '- ' + t).join('\n') || '(none)'}\n\nCandidates:\n${list}`;
  const out = await jsonCall('story_selection', SELECT_SCHEMA, system, user);
  return out.picks.filter((p) => candidates[p.index]);
}

// ---------- 2. Write the post + image copy + sensitivity ----------

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });

const POST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['post_text', 'card', 'sensitivity'],
  properties: {
    post_text: { type: 'string' },
    card: {
      type: 'object',
      additionalProperties: false,
      required: ['label', 'competition', 'headline_main', 'headline_accent', 'subheadline', 'quote', 'stats', 'footer'],
      properties: {
        label: { type: 'string', description: 'BREAKING, OFFICIAL, RESULT, TRANSFER, INJURY, RECORD...' },
        competition: { type: 'string', description: 'Short competition or club tag, upper case, max 20 chars' },
        headline_main: { type: 'string', description: 'First part of headline, white. 1-3 words' },
        headline_accent: { type: 'string', description: 'Second part, brand colour. 1-3 words' },
        subheadline: { type: 'string', description: 'One sentence, max 140 chars' },
        quote: nullable({
          type: 'object',
          additionalProperties: false,
          required: ['text', 'by'],
          properties: { text: { type: 'string' }, by: { type: 'string' } },
        }),
        stats: {
          type: 'array',
          description: '0-3 key numbers taken from the article',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['value', 'label'],
            properties: { value: { type: 'string' }, label: { type: 'string' } },
          },
        },
        footer: { type: 'string', description: 'e.g. "DENMARK vs PORTUGAL · THU" or "PREMIER LEAGUE · MATCHDAY 7"' },
      },
    },
    sensitivity: {
      type: 'object',
      additionalProperties: false,
      required: ['level', 'reasons'],
      properties: {
        level: { type: 'string', enum: ['low', 'medium', 'high'] },
        reasons: { type: 'string' },
      },
    },
  },
};

export async function writePost({ title, source, link, text, summary }) {
  const system = `You write Facebook posts for "Fast Score" (football livescore app). Language: English.

STRICT RULES
- Use ONLY facts in the article. Never invent quotes, numbers, dates or details. Reports/rumours must be framed as "reportedly" / "according to <outlet>".
- Quotes must be copied verbatim from the article; if there is no good one, set quote to null.

POST FORMAT (post_text), similar to:
🚨 UPPER-CASE HOOK HEADLINE <flag or relevant emoji>
(plain text only: Facebook does not render markdown, so no ** or #headings)

One short teaser line 👀

📌 fact
📌 fact (3-5 bullets total, short)

🗣️ Name: "verbatim quote"   (only if one exists)

One line of context or a question 🤔

👉 A call to action asking fans to comment ⬇️

${config.brand.hashtag} #Tag #Tag #Tag (5-7 hashtags, ${config.brand.hashtag} first)

Do not add a source line or links (added automatically).

IMAGE CARD (card): headline_main + headline_accent together form a punchy 2-5 word headline (e.g. "Ronaldo" + "walks out"). Stats only if real numbers appear in the article.

SENSITIVITY (sensitivity.level)
- high: death, serious injury/illness of a person, crime, police or legal accusations, abuse, racism/discrimination, violence, politics/war, match-fixing or betting scandals, minors, unconfirmed allegations that could damage a named person's reputation, anything tragic.
- medium: player-coach rifts, disciplinary issues, harsh criticism, contested refereeing, transfer rumours.
- low: results, fixtures, records, confirmed transfers, line-ups, awards, positive news.
Explain the level briefly in reasons.`;
  const user = `Source: ${source}\nURL: ${link}\nTitle: ${title}\n\nArticle text:\n${text || summary}`;
  return jsonCall('facebook_post', POST_SCHEMA, system, user);
}
