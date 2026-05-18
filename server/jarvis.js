/* JARVIS chat proxy. Routes messages to Anthropic when an API key
   is configured; otherwise returns a deterministic simulated reply
   so the dashboard still works. */

import Anthropic from '@anthropic-ai/sdk';
import { getEnrichedSponsors } from './gmail.js';
import { HARD_RULES } from './sponsors.js';

const MODEL = 'claude-sonnet-4-5';

const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — the outreach intelligence layer for ZMM Events.
You serve Shane Michelon, President of ZMM Events and Co-Founder of the NightSchool college tour.

VOICE: dry, precise, lightly formal. Address him as "sir" or "Mr. Michelon" sparingly.
Match the Iron Man JARVIS persona — concise, confident, never apologetic for being useful.

HARD RULES (non-negotiable):
${HARD_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}

When asked for status, return crisp factual answers grounded in the live pipeline data provided.
When asked to draft an email, produce a complete subject + body using the ZMM Events intro:
"I'm Shane Michelon, President of ZMM Events and Co-Founder of the NightSchool college tour."
Always remind that zach@zmmevents.com must be CC'd.
Never produce outreach to Constellation Brands — refuse and cite the legal directive.`;

export function isEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function chat(messages) {
  const sponsors = await getEnrichedSponsors();
  const pipelineSummary = buildPipelineSummary(sponsors);

  if (!isEnabled()) {
    return simulatedReply(messages[messages.length - 1]?.content || '', sponsors);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `CURRENT PIPELINE STATE (live from Gmail):\n${pipelineSummary}` },
    ],
    messages: messages.map((m) => ({
      role: m.role === 'jarvis' ? 'assistant' : 'user',
      content: m.content,
    })),
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return text || '(no response)';
}

function buildPipelineSummary(sponsors) {
  const stages = ['CLOSED', 'IN_DEAL', 'ENGAGED', 'COLD', 'PAST', 'BLOCKED'];
  const lines = [];
  for (const stage of stages) {
    const group = sponsors.filter((s) => s.stage === stage);
    if (group.length === 0) continue;
    lines.push(`\n${stage}:`);
    for (const s of group) {
      lines.push(
        `  - ${s.name} (${s.event}, tier ${s.tier}) — status=${s.status}` +
        (s.value ? `, $${s.value}` : '') +
        (s.lastOutbound ? `, last_out=${s.lastOutbound.slice(0, 10)}` : '') +
        (s.lastInbound ? `, last_in=${s.lastInbound.slice(0, 10)}` : '') +
        (s.followUpDue ? `, follow_up_due=${s.followUpDue.slice(0, 10)}` : '') +
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
  if (q.includes('draft') || q.includes('email') || q.includes('write')) {
    return 'Live drafting requires the Anthropic API key. Set ANTHROPIC_API_KEY in .env and restart the server.';
  }
  return 'Acknowledged. Live JARVIS requires ANTHROPIC_API_KEY in .env. Until then I can answer simple queries about overdue follow-ups, pipeline value, and hard rules.';
}
