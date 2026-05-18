/* JARVIS chat — agentic loop with tool use.
   Tools JARVIS can call:
     - draft_email          : produces a draft for user approval (loop stops here)
     - update_sponsor       : change stage/value/status/notes/tier/event
     - mark_followup        : stamp "just followed up" on a sponsor
     - sync_pipeline        : trigger a regular Gmail sync (waits for completion)
     - deep_sync_pipeline   : trigger a full historical scan (returns immediately)

   The frontend reloads pipeline data whenever the response contains
   any non-draft actions. */

import Anthropic from '@anthropic-ai/sdk';
import { getEnrichedSponsors, syncAllSponsors, startDeepSync } from './gmail.js';
import { HARD_RULES, SPONSORS } from './sponsors.js';
import { ccAddress } from './email.js';
import { setOverride, dismissDiscovered, loadStore } from './store.js';

const MODEL = 'claude-sonnet-4-5';

const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — the outreach intelligence layer for ZMM Events.
You serve Shane Michelon, President of ZMM Events and Co-Founder of the NightSchool college tour.

VOICE: dry, precise, lightly formal. Address him as "sir" or "Mr. Michelon" sparingly.
Match the Iron Man JARVIS persona — concise, confident, never apologetic for being useful.

HARD RULES (non-negotiable):
${HARD_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}

You have tools to ACT on the pipeline. Use them — don't just talk.
  - update_sponsor: when Shane tells you a deal changed (new stage, value, notes, etc.)
  - mark_followup: when Shane mentions he sent a follow-up outside the dashboard
  - sync_pipeline: when Shane asks to refresh, update, or sync
  - deep_sync_pipeline: when Shane asks for a full rescan or complete history rebuild
  - draft_email: when Shane asks you to draft, write, or send an email

For drafts: do NOT paste the body in your text response — the tool produces a card the
user reviews and approves. Briefly confirm in text that you have prepared the draft.

When drafting:
- Use the contact email from the pipeline data.
- First contact: use the intro "I'm Shane Michelon, President of ZMM Events and Co-Founder of the NightSchool college tour."
- Sign as "Shane Michelon · President, ZMM Events".
- The server auto-CCs ${ccAddress()} — do not include it.
- Refuse and cite the legal directive if asked to contact Constellation Brands.

After running tools, give Shane a one-line confirmation of what changed. Don't restate the data — he's looking at the dashboard.`;

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
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain-text body. Use \\n for line breaks.' },
        sponsor_id: { type: 'string' },
        thread_id: { type: 'string', description: 'Gmail thread ID to reply within (optional).' },
        reason: { type: 'string', description: 'One short sentence on why this draft.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'update_sponsor',
    description:
      "Update a sponsor's pipeline fields. Use when Shane tells you a deal " +
      "changed — new stage, value, status, notes, tier, or event.",
    input_schema: {
      type: 'object',
      properties: {
        sponsor_id: { type: 'string', description: 'Sponsor ID from the pipeline data.' },
        stage: { type: 'string', enum: ['CLOSED', 'IN_DEAL', 'ENGAGED', 'COLD', 'PAST', 'BLOCKED'] },
        status: {
          type: 'string',
          enum: ['SIGNED', 'REDLINE', 'PROPOSAL_OUT', 'WAITING', 'STALE', 'INTRO', 'COLD', 'WARM', 'DO_NOT_CONTACT', 'DROPPED'],
        },
        value: { type: 'number', description: 'Deal value in dollars.' },
        notes: { type: 'string' },
        tier: { type: 'string', enum: ['A', 'B', 'C'] },
        event: { type: 'string' },
      },
      required: ['sponsor_id'],
    },
  },
  {
    name: 'mark_followup',
    description:
      'Stamp the sponsor as just-followed-up. Use when Shane says he sent a follow-up outside the dashboard.',
    input_schema: {
      type: 'object',
      properties: { sponsor_id: { type: 'string' } },
      required: ['sponsor_id'],
    },
  },
  {
    name: 'sync_pipeline',
    description: 'Run a regular Gmail sync (latest threads, ~5s). Use when Shane asks to refresh, update, or sync.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'deep_sync_pipeline',
    description: 'Run a full historical scan across every connected inbox (~1 min, async). Use when Shane asks for a complete rescan or full history rebuild.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'dismiss_discovered',
    description:
      'Hide an auto-discovered contact from the pipeline. Use when Shane says the contact is not a real sponsor lead (e.g. a vendor, friend, or noise address that slipped through the filters).',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'The email address to dismiss.' },
      },
      required: ['email'],
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
    return {
      text: simulatedReply(messages[messages.length - 1]?.content || '', sponsors),
      draft: null,
      actions: [],
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const conversation = messages.map((m) => ({
    role: m.role === 'jarvis' ? 'assistant' : 'user',
    content: m.content,
  }));

  const actions = [];
  let draft = null;
  let finalText = '';

  const MAX_ITERS = 5;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `CURRENT PIPELINE STATE (live from Gmail):\n${pipelineSummary}` },
      ],
      tools: TOOLS,
      messages: conversation,
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (text) finalText = text;

    const toolUses = response.content.filter((b) => b.type === 'tool_use');

    // draft_email is a "stop here for user approval" tool — surface it
    // up to the user instead of feeding a tool_result back to Claude.
    const draftBlock = toolUses.find((b) => b.name === 'draft_email');
    if (draftBlock) {
      draft = {
        to: draftBlock.input.to,
        subject: draftBlock.input.subject,
        body: draftBlock.input.body,
        sponsorId: draftBlock.input.sponsor_id || null,
        threadId: draftBlock.input.thread_id || null,
        reason: draftBlock.input.reason || null,
      };
      break;
    }

    // No more tools → final response, exit loop.
    if (toolUses.length === 0 || response.stop_reason === 'end_turn') break;

    // Execute the non-draft tools, send tool_results back, continue.
    const toolResults = [];
    for (const block of toolUses) {
      try {
        const result = await executeTool(block.name, block.input);
        actions.push({ name: block.name, input: block.input, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        actions.push({ name: block.name, input: block.input, result: { ok: false, error: err.message } });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({ error: err.message }),
          is_error: true,
        });
      }
    }

    conversation.push({ role: 'assistant', content: response.content });
    conversation.push({ role: 'user', content: toolResults });
  }

  return {
    text: finalText || (draft ? 'Draft ready for your review.' : 'Done.'),
    draft,
    actions,
  };
}

/* Execute a single tool call. All actions also include the human-readable
   sponsor name so the frontend can render "Updated Polymarket" without
   another lookup. */
async function executeTool(name, input) {
  const lookupSponsor = (id) => SPONSORS.find((s) => s.id === id);

  switch (name) {
    case 'update_sponsor': {
      const { sponsor_id, ...rest } = input;
      const sponsor = lookupSponsor(sponsor_id);
      if (!sponsor) return { ok: false, error: `Unknown sponsor_id: ${sponsor_id}` };
      const allowed = ['stage', 'value', 'notes', 'status', 'tier', 'event'];
      const patch = {};
      for (const k of allowed) if (k in rest && rest[k] !== undefined) patch[k] = rest[k];
      if (Object.keys(patch).length === 0) return { ok: false, error: 'No valid fields provided.' };
      await setOverride(sponsor_id, patch);
      return { ok: true, sponsor_id, sponsor_name: sponsor.name, applied: patch };
    }
    case 'mark_followup': {
      const { sponsor_id } = input;
      const sponsor = lookupSponsor(sponsor_id);
      if (!sponsor) return { ok: false, error: `Unknown sponsor_id: ${sponsor_id}` };
      await setOverride(sponsor_id, { _manualLastOutbound: new Date().toISOString() });
      return { ok: true, sponsor_id, sponsor_name: sponsor.name };
    }
    case 'sync_pipeline': {
      const result = await syncAllSponsors({ force: true });
      return { ok: true, lastSync: result.lastSync };
    }
    case 'deep_sync_pipeline': {
      const result = startDeepSync();
      return { ok: true, started: result.started, message: result.started ? 'Deep sync running in background (~1 minute).' : 'A deep sync is already in progress.' };
    }
    case 'dismiss_discovered': {
      const { email } = input;
      await dismissDiscovered(email);
      return { ok: true, email };
    }
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
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
        (s._autoDiscovered ? ' [AUTO]' : '') +
        (s.contact ? `, contact=${s.contact}` : '') +
        (s.value ? `, $${s.value}` : '') +
        (s.lastOutbound ? `, last_out=${s.lastOutbound.slice(0, 10)}` : '') +
        (s.lastInbound ? `, last_in=${s.lastInbound.slice(0, 10)}` : '') +
        (s.followUpDue ? `, follow_up_due=${s.followUpDue.slice(0, 10)}` : '') +
        (s.messageCount != null ? `, total_msgs=${s.messageCount}` : '') +
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
  return 'Acknowledged. Live JARVIS requires ANTHROPIC_API_KEY. Until then I can answer simple queries about overdue follow-ups, pipeline value, and hard rules.';
}
