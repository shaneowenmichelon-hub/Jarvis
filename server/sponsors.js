/* Sponsor configuration — this is the "stage map" the app uses to
   group threads. Inbox-derived state (lastOutbound, lastInbound,
   threadCount, followUpDue) is filled in by the Gmail sync.
   Edit this file to add/remove sponsors. */

export const HARD_BOUNCES_DEFAULT = 69;

export const HARD_RULES = [
  'CC zach@zmmevents.com on all outbound',
  'NEVER contact Constellation Brands',
  'Standard intro: Shane Michelon, ZMM Events / NightSchool',
];

export const EVENTS = ['Night School', 'HOMETURF', 'Hells Gala', 'Boot Block Party'];

export const SPONSORS = [
  // CLOSED
  { id: 'buddy',        name: 'BUDDY',                stage: 'CLOSED',  tier: 'A', value: 45000, event: 'HOMETURF',         contact: 'jordan@buddy.co',           status: 'SIGNED', notes: 'Contract counter-signed. Activation deck due 6/2.' },
  { id: 'amaze',        name: 'AMAZE',                stage: 'IN_DEAL', tier: 'A', value: 5000,  event: 'Hells Gala',       contact: 'mira@amaze.com',            status: 'PROPOSAL_OUT', notes: 'Estimated $5K. Hells Gala activation. Final number TBD.' },
  { id: 'nevermissed',  name: 'NeverMissed',          stage: 'PAST',    tier: 'B', value: 0,     event: 'Boot Block Party', contact: 'team@nevermissed.app',      status: 'DROPPED', notes: '$5K refunded. Not ideal partner — do not re-pitch.' },

  // IN-DEAL
  { id: 'polymarket',   name: 'Polymarket',           stage: 'CLOSED',  tier: 'A', value: 0,     event: 'Night School',     contact: 'partnerships@polymarket.com', status: 'SIGNED',       notes: 'Performance deal: $75 per signup using code NIGHTSCHOOL that deposits $20+. Live across Night School tour + NYC/NOLA shows.' },
  { id: 'flybyjing',    name: 'Fly By Jing',          stage: 'PAST',    tier: 'B', value: 0,     event: 'Night School',     contact: 'jing@flybyjing.com',        status: 'DROPPED',      notes: 'Canceled — no available budget.' },
  { id: 'canes',        name: "Raising Cane's",       stage: 'IN_DEAL', tier: 'A', value: 60000, event: 'HOMETURF',         contact: 'sponsor@raisingcanes.com',  status: 'WAITING',      notes: 'Regional approvals — ping Friday.' },
  { id: 'bodyarmor',    name: 'BODYARMOR',            stage: 'IN_DEAL', tier: 'A', value: 55000, event: 'Hells Gala',       contact: 'sports@bodyarmor.com',      status: 'STALE',        notes: 'Stalled. Push or drop next week.' },
  { id: 'prizepicks',   name: 'PrizePicks',           stage: 'IN_DEAL', tier: 'A', value: 80000, event: 'HOMETURF',         contact: 'brand@prizepicks.com',      status: 'PROPOSAL_OUT', notes: 'Awaiting media plan revision.' },
  { id: 'bloom',        name: 'Bloom Energy',         stage: 'IN_DEAL', tier: 'B', value: 28000, event: 'Boot Block Party', contact: 'partner@bloomenergy.com',   status: 'WAITING',      notes: 'Internal budget cycle ends 5/22.' },

  // ENGAGED
  { id: 'liquid-death', name: 'Liquid Death',         stage: 'IN_DEAL', tier: 'A', value: 1500,  event: 'Night School',     contact: 'partnerships@liquiddeath.com', status: 'PROPOSAL_OUT', notes: '5 Night School stops × $300/stop.' },
  { id: 'olipop',       name: 'Olipop',               stage: 'ENGAGED', tier: 'B', value: 0,     event: 'Night School',     contact: 'brand@drinkolipop.com',     status: 'INTRO',  notes: 'Sent deck v2.' },
  { id: 'celsius',      name: 'Celsius',              stage: 'ENGAGED', tier: 'A', value: 0,     event: 'HOMETURF',         contact: 'campus@celsius.com',        status: 'STALE',  notes: 'No response since 5/8. Re-engage.' },

  // COLD
  { id: 'redbull',      name: 'Red Bull',             stage: 'COLD',    tier: 'A', value: 0,     event: 'HOMETURF',         contact: 'collegiate@redbull.com',    status: 'COLD',   notes: 'No reply on first touch.' },
  { id: 'monster',      name: 'Monster Energy',       stage: 'COLD',    tier: 'A', value: 0,     event: 'Hells Gala',       contact: 'sports@monsterenergy.com',  status: 'COLD',   notes: '2nd touch overdue.' },
  { id: 'gatorade',     name: 'Gatorade',             stage: 'COLD',    tier: 'A', value: 0,     event: 'HOMETURF',         contact: 'partnerships@gatorade.com', status: 'COLD',   notes: '' },
  { id: 'chipotle',     name: 'Chipotle',             stage: 'COLD',    tier: 'B', value: 0,     event: 'Night School',     contact: 'sponsorships@chipotle.com', status: 'COLD',   notes: 'Long overdue. Drop or retry from new domain.' },

  // PAST
  { id: 'rhoback',      name: 'Rhoback',              stage: 'PAST',    tier: 'B', value: 0,     event: 'HOMETURF',         contact: 'collegiate@rhoback.com',    status: 'WARM',   notes: 'Renewal pitch for fall.' },
  { id: 'shopify',      name: 'Shopify',              stage: 'PAST',    tier: 'A', value: 0,     event: 'Night School',     contact: 'campus@shopify.com',        status: 'WARM',   notes: 'Schedule renewal call.' },

  // BLOCKED — never contacted
  { id: 'constellation',name: 'Constellation Brands', stage: 'BLOCKED', tier: '—', value: 0,     event: '—',                contact: null,                        status: 'DO_NOT_CONTACT', notes: 'Hard block. Legal directive.' },
];

/* Derive default follow-up dates from inbox data.
   Rule of thumb:
   - CLOSED / BLOCKED: no follow-up
   - If last outbound > last inbound, follow-up due 3 business days after last outbound
   - If last inbound > last outbound, follow-up due 1 business day after last inbound
   - If no inbox data, no follow-up */
export function computeFollowUp(sponsor, threadState) {
  if (sponsor.stage === 'CLOSED' || sponsor.stage === 'BLOCKED') return null;
  if (!threadState) return null;
  const { lastOutbound, lastInbound } = threadState;
  if (!lastOutbound && !lastInbound) return null;

  const outDate = lastOutbound ? new Date(lastOutbound) : null;
  const inDate = lastInbound ? new Date(lastInbound) : null;

  let base, offsetDays;
  if (outDate && (!inDate || outDate > inDate)) {
    base = outDate;
    offsetDays = 3;
  } else if (inDate) {
    base = inDate;
    offsetDays = 1;
  } else {
    return null;
  }
  const due = new Date(base);
  due.setDate(due.getDate() + offsetDays);
  return due.toISOString();
}
