/* JARVIS chat proxy. Uses Anthropic tool use to let JARVIS draft
   emails when the user asks. Drafts come back as structured data
   so the frontend can render a review-and-approve card. Actual
   sending happens via POST /api/jarvis/send after user approval. */

import Anthropic from '@anthropic-ai/sdk';
import { getEnrichedSponsors } from './gmail.js';
import { HARD_RULES } from './sponsors.js';
import { ccAddress } from './email.js';

const MODEL = 'claude-sonnet-4-5';

const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — the outreach intelligence layer for ZMM Events.
You serve Shane Michelon, President of ZMM Events and Co-Founder of the NightSchool college tour.

VOICE: dry, precise, lightly formal. Address him as "sir" or "Mr. Michelon" sparingly.
Match the Iron Man JARVIS persona — concise, confident, never apologetic for being useful.

HARD RULES (non-negotiable):
${HARD_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}

When asked for status, return crisp factual answers grounded in the live pipeline data.

When asked to draft, write, or send an email: use the draft_email tool. Do NOT
paste the email body into your text response. The tool produces a draft the
user reviews and approves before send. Briefly confirm in your text that you
have prepared the draft.

When drafting:
- Use the contact email from the pipeline data.
- Use the standard intro on first contacts: "I'm Shane Michelon, President of ZMM Events and Co-Founder of the NightSchool college tour."
- Sign as "Shane Michelon · President, ZMM Events".
- The server automatically CCs ${ccAddress()} — do not include it.
- Refuse and cite the legal directive if asked to contact Constellation Brands.

When asked to reply within an existing thread, include thread_id (the most recent thread ID from the pipeline data for that sponsor).`;

const TOOLS = [
  {
    name: 'draft_email',
    description:
      'Draft a sponsorship email for the user to review. The user will approve before send. ' +
      'CC and rule enforcement happen server-side automatically.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address.' },
        subject: { type: 'string', description: 'Email subject line.' },
        body: {
          type: 'string',
          description:
            'Email body as plain text. Use \\n for line breaks. Sign as Shane Michelon, President of ZMM Events.',
        },
        sponsor_id: {
          type: 'string',
          description: 'Sponsor ID from the pipeline data (optional).',
        },
        thread_id: {
          type: 'string',
          description:
            'Gmail thread ID to reply within (optional). Use the most recent thread for the sponsor when following up.',
        },
        reason: {
          type: 'string',
          description: 'One short sentence explaining why this draft, for the user to skim.',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
];

export function isEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function chat(messages) {
  const sponsors = await getEnrichedSponsors();
  const pipelineSummary = buildPipelineSummary(sponsors);

  if (!isEnabled()) {
    return { text: simulatedReply(messages[messages.length - 1]?.content || '', sponsors), draft: null };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `CURRENT PIPELINE STATE (live from Gmail):\n${pipelineSummary}` },
    ],
    tools: TOOLS,
    messages: messages.map((m) => ({
      role: m.role === 'jarvis' ? 'assistant' : 'user',
      content: m.content,
    })),
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'draft_email');
  const draft = toolUse?.input
    ? {
        to: toolUse.input.to,
        subject: toolUse.input.subject,
        body: toolUse.input.body,
        sponsorId: toolUse.input.sponsor_id || null,
        threadId: toolUse.input.thread_id || null,
        reason: toolUse.input.reason || null,
      }
    : null;

  return {
    text: text || (draft ? 'Draft ready for your review.' : '(no response)'),
    draft,
  };
}

function buildPipelineSummary(sponsors) {
  const stages = ['CLOSED', 'IN_DEAL', 'ENGAGED', 'COLD', 'PAST', 'BLOCKED'];
  const lines = [];
  for (const stage of stages) {
    const group = sponsors.filter((s) => s.stage === stage);
    if (group.length === 0) continue;
    lines.push(`\n${stage}:`);
    for (const s of group) {
      const recentThread = s.threadIds?.[0];
      lines.push(
        `  - ${s.name} [id=${s.id}] (${s.event}, tier ${s.tier}) — status=${s.status}` +
        (s.contact ? `, contact=${s.contact}` : '') +
        (s.value ? `, $${s.value}` : '') +
        (s.lastOutbound ? `, last_out=${s.lastOutbound.slice(0, 10)}` : '') +
        (s.lastInbound ? `, last_in=${s.lastInbound.slice(0, 10)}` : '') +
        (s.followUpDue ? `, follow_up_due=${s.followUpDue.slice(0, 10)}` : '') +
        (recentThread ? `, thread=${recentThread}` : '') +
        (s.notes ? ` // ${s.notes}` : '')
      );
    }
  }
  return lines.join('\n');
}

function simulatedReply(userText, sponsors) {
  const q = userText.toLowerCase();
  const today = new Date();
  const overdue = sponsors.filter(
    (s) => s.followUpDue && new Date(s.followUpDue) < today && s.stage !== 'CLOSED'
  );
  const closedVal = sponsors.filter((s) => s.stage === 'CLOSED').reduce((a, s) => a + s.value, 0);
  const pipeVal = sponsors.filter((s) => s.stage === 'IN_DEAL').reduce((a, s) => a + s.value, 0);

  if (q.includes('overdue') || q.includes('follow')) {
    if (overdue.length === 0) return 'No overdue follow-ups, sir. The queue is clear.';
    return `Overdue threads: ${overdue.slice(0, 4).map((s) => s.name).join(', ')}. Recommend prioritizing ${overdue[0].name}.`;
  }
  if (q.includes('pipeline') || q.includes('revenue') || q.includes('value')) {
    return `Closed revenue: $${(closedVal / 1000).toFixed(0)}K. In-deal pipeline: $${(pipeVal / 1000).toFixed(0)}K across ${sponsors.filter((s) => s.stage === 'IN_DEAL').length} active negotiations.`;
  }
  if (q.includes('constellation')) {
    return 'Constellation Brands is hard-blocked per legal directive. I will not draft, send, or surface outreach to that entity.';
  }
  if (q.includes('draft') || q.includes('email') || q.includes('write') || q.includes('send')) {
    return 'Email drafting requires ANTHROPIC_API_KEY in the server env. Set it and redeploy.';
  }
  return 'Acknowledged. Live JARVIS requires ANTHROPIC_API_KEY. Until then I can answer simple queries about overdue follow-ups, pipeline value, and hard rules.';
}
