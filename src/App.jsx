import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Activity, Mail, Send, Clock, AlertTriangle, CheckCircle2, XCircle,
  Target, Cpu, TrendingUp, Users, Shield, Search,
  ChevronRight, Calendar, Inbox, MailX, Flame,
  Power, Wifi, Lock, Eye, MessageSquare, ArrowUpRight, Sparkles,
  RefreshCw, LogOut, Link2, AlertCircle,
} from 'lucide-react';
import { api } from './api.js';

/* ============================================================
   ZMM // SPONSOR COMMAND
   Jarvis-style sponsorship outreach tracking dashboard.
   Shane Michelon — President, ZMM Events.
   Data source: Express backend wired to Gmail via OAuth.
   ============================================================ */

const COLORS = {
  bg: '#040813',
  bgPanel: 'rgba(8, 18, 36, 0.85)',
  cyan: '#5be0ff',
  cyanDim: 'rgba(91, 224, 255, 0.35)',
  cyanFaint: 'rgba(91, 224, 255, 0.12)',
  cyanGlow: 'rgba(91, 224, 255, 0.55)',
  orange: '#ff9a3c',
  orangeDim: 'rgba(255, 154, 60, 0.35)',
  red: '#ff4d6d',
  redDim: 'rgba(255, 77, 109, 0.35)',
  green: '#4eff9f',
  greenDim: 'rgba(78, 255, 159, 0.35)',
  yellow: '#ffd86b',
  text: '#cfe7ff',
  textDim: '#7895b8',
  border: 'rgba(91, 224, 255, 0.22)',
};

const FONT_DISPLAY = "'Orbitron', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

const POLL_INTERVAL_MS = 60_000;

const STAGE_META = {
  CLOSED:  { label: 'CLOSED',   color: COLORS.green,   bg: 'rgba(78, 255, 159, 0.10)' },
  IN_DEAL: { label: 'IN-DEAL',  color: COLORS.orange,  bg: 'rgba(255, 154, 60, 0.10)' },
  ENGAGED: { label: 'ENGAGED',  color: COLORS.cyan,    bg: 'rgba(91, 224, 255, 0.10)' },
  COLD:    { label: 'COLD',     color: COLORS.textDim, bg: 'rgba(120, 149, 184, 0.08)' },
  PAST:    { label: 'PAST',     color: COLORS.yellow,  bg: 'rgba(255, 216, 107, 0.10)' },
  BLOCKED: { label: 'BLOCKED',  color: COLORS.red,     bg: 'rgba(255, 77, 109, 0.10)' },
};

const STATUS_META = {
  SIGNED:         { color: COLORS.green },
  REDLINE:        { color: COLORS.orange },
  PROPOSAL_OUT:   { color: COLORS.cyan },
  WAITING:        { color: COLORS.yellow },
  STALE:          { color: COLORS.red },
  INTRO:          { color: COLORS.cyan },
  COLD:           { color: COLORS.textDim },
  WARM:           { color: COLORS.yellow },
  DO_NOT_CONTACT: { color: COLORS.red },
};

const RULE_ICONS = { cc: Mail, block: Shield, intro: Users };

/* ============================================================
   APP
   ============================================================ */
export default function App() {
  const [now, setNow] = useState(new Date());
  const [authStatus, setAuthStatus] = useState({ connected: false, configured: false, user: null, lastSync: null });
  const [meta, setMeta] = useState({ hardRules: [], events: [], hardBounces: 0 });
  const [sponsors, setSponsors] = useState([]);
  const [activeStage, setActiveStage] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  /* live clock — pure aesthetic */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* initial load */
  const loadAll = useCallback(async ({ forceSync = false } = {}) => {
    try {
      if (forceSync) setSyncing(true);
      const [auth, metaRes, sponsorRes] = await Promise.all([
        api.authStatus(),
        api.meta(),
        api.sponsors({ sync: forceSync }),
      ]);
      setAuthStatus(auth);
      setMeta(metaRes);
      setSponsors(sponsorRes.sponsors);
      setLastSync(sponsorRes.lastSync);
      setError(null);
      if (!selectedId && sponsorRes.sponsors.length) {
        const inDeal = sponsorRes.sponsors.find((s) => s.stage === 'IN_DEAL');
        setSelectedId(inDeal?.id || sponsorRes.sponsors[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadAll();
    const t = setInterval(() => loadAll(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [loadAll]);

  /* handle OAuth redirect (?connected=1 after callback) */
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get('connected') === '1') {
      u.searchParams.delete('connected');
      window.history.replaceState({}, '', u.toString());
      loadAll({ forceSync: true });
    }
  }, [loadAll]);

  const stats = useMemo(() => computeStats(sponsors, now), [sponsors, now]);
  const filtered = useMemo(() => {
    return sponsors.filter((s) => {
      if (activeStage !== 'ALL' && s.stage !== activeStage) return false;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [sponsors, activeStage, search]);
  const selected = sponsors.find((s) => s.id === selectedId) || sponsors[0];

  const markFollowedUp = async (id) => {
    try {
      await api.markFollowup(id);
      await loadAll({ forceSync: true });
    } catch (err) {
      setError(err.message);
    }
  };

  const connectGmail = () => {
    window.location.href = '/auth/google';
  };

  const disconnectGmail = async () => {
    await api.logout();
    await loadAll();
  };

  return (
    <div style={styles.shell}>
      <BackgroundFX />
      <TopBar
        now={now}
        stats={stats}
        authStatus={authStatus}
        lastSync={lastSync}
        syncing={syncing}
        onSync={() => loadAll({ forceSync: true })}
        onConnect={connectGmail}
        onDisconnect={disconnectGmail}
      />

      {!authStatus.configured && <SetupBanner />}
      {authStatus.configured && !authStatus.connected && <ConnectBanner onConnect={connectGmail} />}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div style={styles.mainGrid}>
        <div style={styles.col}>
          <KpiPanel stats={stats} loading={loading} />
          <FollowUpPanel
            overdue={stats.overdue}
            dueSoon={stats.dueSoon}
            onSelect={setSelectedId}
            onMark={markFollowedUp}
          />
          <RulesPanel rules={meta.hardRules} />
        </div>

        <div style={styles.col}>
          <PipelinePanel
            pipeline={filtered}
            activeStage={activeStage}
            setActiveStage={setActiveStage}
            search={search}
            setSearch={setSearch}
            selectedId={selectedId}
            onSelect={setSelectedId}
            totalCount={sponsors.length}
            loading={loading}
            now={now}
          />
          <BouncePanel value={meta.hardBounces} />
        </div>

        <div style={styles.col}>
          <DetailPanel sponsor={selected} onMark={markFollowedUp} now={now} />
          <JarvisPanel
            open={chatOpen}
            setOpen={setChatOpen}
            sponsor={selected}
            stats={stats}
          />
        </div>
      </div>

      <GlobalKeyframes />
    </div>
  );
}

/* ============================================================
   BANNERS
   ============================================================ */
function SetupBanner() {
  return (
    <div style={{ ...styles.banner, borderColor: COLORS.yellow + '55', color: COLORS.yellow }}>
      <AlertCircle size={14} />
      <div>
        <strong>SETUP REQUIRED:</strong> Add Google OAuth credentials to <code>.env</code> to
        enable live Gmail sync. See <code>.env.example</code>. Dashboard is showing seed data.
      </div>
    </div>
  );
}

function ConnectBanner({ onConnect }) {
  return (
    <div style={{ ...styles.banner, borderColor: COLORS.cyanDim, color: COLORS.cyan }}>
      <Link2 size={14} />
      <div style={{ flex: 1 }}>
        <strong>GMAIL OFFLINE.</strong> Connect to pull live thread state.
      </div>
      <button onClick={onConnect} style={{ ...styles.actionBtn, color: COLORS.cyan, borderColor: COLORS.cyan }}>
        <Link2 size={11} /> CONNECT GMAIL
      </button>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }) {
  return (
    <div style={{ ...styles.banner, borderColor: COLORS.redDim, color: COLORS.red }}>
      <AlertTriangle size={14} />
      <div style={{ flex: 1 }}>{message}</div>
      <button onClick={onDismiss} style={styles.bannerClose}><XCircle size={14} /></button>
    </div>
  );
}

/* ============================================================
   BACKGROUND FX
   ============================================================ */
function BackgroundFX() {
  return (
    <>
      <div style={styles.bgGrid} />
      <div style={styles.bgGlow1} />
      <div style={styles.bgGlow2} />
      <div style={styles.bgScanline} />
    </>
  );
}

/* ============================================================
   TOP BAR
   ============================================================ */
function TopBar({ now, stats, authStatus, lastSync, syncing, onSync, onConnect, onDisconnect }) {
  const time = now.toLocaleTimeString('en-US', { hour12: false });
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const connected = authStatus.connected;
  const userLine = authStatus.user?.email
    ? authStatus.user.email.toUpperCase()
    : 'SHANE MICHELON · PRES';

  return (
    <div style={styles.topBar}>
      <div style={styles.topLeft}>
        <div style={styles.reactorMini}>
          <div style={styles.reactorCore} />
          <div style={styles.reactorRing} />
        </div>
        <div>
          <div style={styles.brand}>
            ZMM <span style={{ color: COLORS.orange }}>//</span> SPONSOR COMMAND
          </div>
          <div style={styles.brandSub}>
            J.A.R.V.I.S. · OUTREACH INTELLIGENCE LAYER · v0.2
          </div>
        </div>
      </div>

      <div style={styles.topCenter}>
        <Pill icon={Power} color={COLORS.green} label="ONLINE" pulse />
        {connected ? (
          <Pill icon={Wifi} color={COLORS.cyan} label="GMAIL LIVE" />
        ) : (
          <Pill icon={Wifi} color={COLORS.textDim} label="GMAIL OFFLINE" />
        )}
        <Pill icon={Lock} color={COLORS.cyan} label="MCP SECURE" />
        {stats.overdue.length > 0 && (
          <Pill icon={AlertTriangle} color={COLORS.red} label={`${stats.overdue.length} OVERDUE`} pulse />
        )}
        <button
          onClick={onSync}
          disabled={syncing || !connected}
          title={connected ? 'Resync Gmail' : 'Connect Gmail first'}
          style={{
            ...styles.iconBtn,
            color: connected ? COLORS.cyan : COLORS.textDim,
            borderColor: connected ? COLORS.cyanDim : COLORS.border,
          }}
        >
          <RefreshCw size={11} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
        {connected && (
          <button
            onClick={onDisconnect}
            title="Disconnect Gmail"
            style={{ ...styles.iconBtn, color: COLORS.textDim, borderColor: COLORS.border }}
          >
            <LogOut size={11} />
          </button>
        )}
      </div>

      <div style={styles.topRight}>
        <div style={styles.clock}>{time}</div>
        <div style={styles.clockDate}>{date.toUpperCase()}</div>
        <div style={styles.clockUser}>{userLine}</div>
        {connected && (
          <div style={styles.clockSync}>
            SYNC {lastSync ? relativeTime(lastSync, now) : '—'}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ icon: Icon, color, label, pulse }) {
  return (
    <div style={{ ...styles.pill, borderColor: color + '55', color }}>
      <Icon size={11} style={pulse ? { animation: 'pulse 1.4s infinite' } : undefined} />
      <span>{label}</span>
    </div>
  );
}

/* ============================================================
   PANELS
   ============================================================ */
function Panel({ title, icon: Icon, accent = COLORS.cyan, right, children, style }) {
  return (
    <div style={{ ...styles.panel, ...style }}>
      <div style={{ ...styles.panelHeader, borderColor: accent + '33' }}>
        <div style={styles.panelHeaderLeft}>
          <Icon size={13} color={accent} />
          <span style={{ color: accent, letterSpacing: '0.18em' }}>{title}</span>
        </div>
        {right}
      </div>
      <div style={styles.panelBody}>{children}</div>
      <CornerMarks accent={accent} />
    </div>
  );
}

function CornerMarks({ accent }) {
  const s = { position: 'absolute', width: 10, height: 10, borderColor: accent + '88' };
  return (
    <>
      <div style={{ ...s, top: 0, left: 0, borderTop: '1px solid', borderLeft: '1px solid' }} />
      <div style={{ ...s, top: 0, right: 0, borderTop: '1px solid', borderRight: '1px solid' }} />
      <div style={{ ...s, bottom: 0, left: 0, borderBottom: '1px solid', borderLeft: '1px solid' }} />
      <div style={{ ...s, bottom: 0, right: 0, borderBottom: '1px solid', borderRight: '1px solid' }} />
    </>
  );
}

/* ============================================================
   KPI PANEL
   ============================================================ */
function KpiPanel({ stats, loading }) {
  return (
    <Panel title="MISSION BRIEF" icon={Activity}>
      <div style={styles.kpiGrid}>
        <KpiCard label="CLOSED REV"   value={loading ? '…' : `$${(stats.closedValue / 1000).toFixed(0)}K`} sub={`${stats.closed} SIGNED`}     color={COLORS.green}   icon={CheckCircle2} />
        <KpiCard label="IN-DEAL PIPE" value={loading ? '…' : `$${(stats.pipelineValue / 1000).toFixed(0)}K`} sub={`${stats.inDeal} ACTIVE`}  color={COLORS.orange}  icon={TrendingUp} />
        <KpiCard label="ENGAGED"      value={loading ? '…' : stats.engaged} sub="EARLY THREADS"                                                  color={COLORS.cyan}    icon={MessageSquare} />
        <KpiCard label="COLD QUEUE"   value={loading ? '…' : stats.cold}    sub="AWAITING REPLY"                                                 color={COLORS.textDim} icon={Inbox} />
      </div>
    </Panel>
  );
}

function KpiCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div style={{ ...styles.kpiCard, borderColor: color + '44' }}>
      <div style={styles.kpiLabel}>
        <Icon size={11} color={color} />
        <span style={{ color }}>{label}</span>
      </div>
      <div style={{ ...styles.kpiValue, color }}>{value}</div>
      <div style={styles.kpiSub}>{sub}</div>
      <div style={{ ...styles.kpiBar, background: color + '22' }}>
        <div style={{ ...styles.kpiBarFill, background: color, width: '70%' }} />
      </div>
    </div>
  );
}

/* ============================================================
   FOLLOW-UP PANEL
   ============================================================ */
function FollowUpPanel({ overdue, dueSoon, onSelect, onMark }) {
  const items = [
    ...overdue.map((s) => ({ ...s, _flag: 'OVERDUE' })),
    ...dueSoon.map((s) => ({ ...s, _flag: 'DUE' })),
  ];
  return (
    <Panel
      title="FOLLOW-UP QUEUE"
      icon={Clock}
      accent={COLORS.orange}
      right={<span style={{ color: COLORS.textDim, fontSize: 10 }}>{items.length} ACTION{items.length === 1 ? '' : 'S'}</span>}
    >
      {items.length === 0 ? (
        <div style={styles.emptyMsg}>
          <CheckCircle2 size={14} color={COLORS.green} />
          <span>QUEUE CLEAR. NICE WORK.</span>
        </div>
      ) : (
        <div style={styles.followList}>
          {items.map((s) => {
            const meta = STAGE_META[s.stage];
            const isOverdue = s._flag === 'OVERDUE';
            const dayDelta = Math.round((new Date(s.followUpDue) - new Date()) / (1000 * 60 * 60 * 24));
            return (
              <div
                key={s.id}
                style={{ ...styles.followItem, borderColor: isOverdue ? COLORS.redDim : COLORS.orangeDim }}
                onClick={() => onSelect(s.id)}
              >
                <div style={styles.followLeft}>
                  <div style={{
                    ...styles.followDot,
                    background: isOverdue ? COLORS.red : COLORS.orange,
                    boxShadow: `0 0 8px ${isOverdue ? COLORS.red : COLORS.orange}`,
                  }} />
                  <div>
                    <div style={styles.followName}>{s.name}</div>
                    <div style={styles.followMeta}>
                      <span style={{ color: meta.color }}>{meta.label}</span>
                      <span>·</span>
                      <span>{s.event}</span>
                    </div>
                  </div>
                </div>
                <div style={styles.followRight}>
                  <div style={{
                    ...styles.followBadge,
                    color: isOverdue ? COLORS.red : COLORS.orange,
                    borderColor: isOverdue ? COLORS.redDim : COLORS.orangeDim,
                  }}>
                    {isOverdue ? `${Math.abs(dayDelta)}D LATE` : dayDelta === 0 ? 'TODAY' : `${dayDelta}D`}
                  </div>
                  <button
                    style={styles.followBtn}
                    onClick={(e) => { e.stopPropagation(); onMark(s.id); }}
                    title="Mark followed up"
                  >
                    <Send size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ============================================================
   RULES PANEL
   ============================================================ */
function RulesPanel({ rules }) {
  const items = rules.map((text, i) => {
    const key = ['cc', 'block', 'intro'][i] || 'rule';
    return { id: key + i, text, Icon: RULE_ICONS[key] || Shield };
  });
  return (
    <Panel title="HARD RULES" icon={Shield} accent={COLORS.red}>
      <div style={styles.rulesList}>
        {items.map((r) => (
          <div key={r.id} style={styles.ruleRow}>
            <r.Icon size={12} color={COLORS.red} />
            <span>{r.text}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ============================================================
   PIPELINE PANEL
   ============================================================ */
function PipelinePanel({
  pipeline, activeStage, setActiveStage, search, setSearch,
  selectedId, onSelect, totalCount, loading, now,
}) {
  const tabs = ['ALL', 'CLOSED', 'IN_DEAL', 'ENGAGED', 'COLD', 'PAST', 'BLOCKED'];
  return (
    <Panel
      title="SPONSOR PIPELINE"
      icon={Target}
      right={<span style={{ color: COLORS.textDim, fontSize: 10 }}>{pipeline.length} / {totalCount}</span>}
    >
      <div style={styles.pipelineControls}>
        <div style={styles.searchBox}>
          <Search size={11} color={COLORS.textDim} />
          <input
            placeholder="search sponsor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <div style={styles.tabs}>
          {tabs.map((t) => {
            const meta = STAGE_META[t];
            const active = activeStage === t;
            const color = t === 'ALL' ? COLORS.cyan : meta.color;
            return (
              <button
                key={t}
                onClick={() => setActiveStage(t)}
                style={{
                  ...styles.tab,
                  color: active ? COLORS.bg : color,
                  background: active ? color : 'transparent',
                  borderColor: color + '66',
                }}
              >
                {t === 'IN_DEAL' ? 'IN-DEAL' : t}
              </button>
            );
          })}
        </div>
      </div>

      <div style={styles.pipelineList}>
        {loading && pipeline.length === 0 ? (
          <div style={styles.emptyMsg}>
            <RefreshCw size={14} color={COLORS.cyan} style={{ animation: 'spin 1s linear infinite' }} />
            <span>LOADING PIPELINE…</span>
          </div>
        ) : pipeline.length === 0 ? (
          <div style={styles.emptyMsg}>
            <XCircle size={14} color={COLORS.textDim} />
            <span>NO SPONSORS MATCH FILTER.</span>
          </div>
        ) : (
          pipeline.map((s) => (
            <PipelineRow key={s.id} sponsor={s} selected={s.id === selectedId} onSelect={onSelect} now={now} />
          ))
        )}
      </div>
    </Panel>
  );
}

function PipelineRow({ sponsor, selected, onSelect, now }) {
  const meta = STAGE_META[sponsor.stage];
  const statusColor = STATUS_META[sponsor.status]?.color || COLORS.textDim;
  const lastOut = sponsor.lastOutbound ? daysSince(sponsor.lastOutbound, now) : null;
  const lastIn = sponsor.lastInbound ? daysSince(sponsor.lastInbound, now) : null;

  return (
    <div
      onClick={() => onSelect(sponsor.id)}
      style={{
        ...styles.row,
        background: selected ? COLORS.cyanFaint : meta.bg,
        borderColor: selected ? COLORS.cyan : COLORS.border,
      }}
    >
      <div style={{ ...styles.rowStageBar, background: meta.color }} />
      <div style={styles.rowMain}>
        <div style={styles.rowTop}>
          <div style={styles.rowName}>{sponsor.name}</div>
          <div style={{ ...styles.rowStage, color: meta.color, borderColor: meta.color + '55' }}>{meta.label}</div>
        </div>
        <div style={styles.rowMeta}>
          <span style={{ color: statusColor }}>● {sponsor.status?.replace('_', ' ')}</span>
          <span style={{ color: COLORS.textDim }}>·</span>
          <span style={{ color: COLORS.textDim }}>{sponsor.event}</span>
          {sponsor.value > 0 && (
            <>
              <span style={{ color: COLORS.textDim }}>·</span>
              <span style={{ color: COLORS.green }}>${(sponsor.value / 1000).toFixed(0)}K</span>
            </>
          )}
        </div>
        <div style={styles.rowMeta}>
          <span style={{ color: COLORS.textDim }}><Send size={9} style={{ verticalAlign: 'middle' }} /> {lastOut ?? '—'}D</span>
          <span style={{ color: COLORS.textDim }}><Inbox size={9} style={{ verticalAlign: 'middle' }} /> {lastIn ?? '—'}D</span>
          <span style={{ color: COLORS.textDim }}><Mail size={9} style={{ verticalAlign: 'middle' }} /> {sponsor.threadCount}</span>
          <span style={{ color: COLORS.textDim, marginLeft: 'auto' }}>TIER {sponsor.tier}</span>
        </div>
      </div>
      <ChevronRight size={14} color={COLORS.cyanDim} />
    </div>
  );
}

/* ============================================================
   BOUNCE PANEL
   ============================================================ */
function BouncePanel({ value }) {
  return (
    <Panel title="DELIVERABILITY" icon={MailX} accent={COLORS.red}>
      <div style={styles.bounceRow}>
        <div>
          <div style={styles.bounceLabel}>HARD BOUNCES</div>
          <div style={styles.bounceValue}>{value}</div>
          <div style={styles.bounceSub}>scrub before next blast</div>
        </div>
        <div style={styles.bounceVisual}>
          <Flame size={42} color={COLORS.red} style={{ animation: 'flicker 2s infinite' }} />
        </div>
      </div>
    </Panel>
  );
}

/* ============================================================
   DETAIL PANEL
   ============================================================ */
function DetailPanel({ sponsor, onMark, now }) {
  if (!sponsor) {
    return (
      <Panel title="TARGET DETAIL" icon={Eye}>
        <div style={styles.emptyMsg}>
          <span>SELECT A SPONSOR.</span>
        </div>
      </Panel>
    );
  }
  const meta = STAGE_META[sponsor.stage];
  const statusColor = STATUS_META[sponsor.status]?.color || COLORS.textDim;

  return (
    <Panel
      title="TARGET DETAIL"
      icon={Eye}
      right={<div style={{ ...styles.detailStage, color: meta.color, borderColor: meta.color + '55' }}>{meta.label}</div>}
    >
      <div style={styles.detailName}>{sponsor.name}</div>
      <div style={styles.detailContact}>
        <Mail size={11} color={COLORS.cyan} /> {sponsor.contact || '—'}
      </div>

      <div style={styles.detailGrid}>
        <DetailStat label="STATUS"        value={sponsor.status?.replace('_', ' ')} color={statusColor} />
        <DetailStat label="EVENT"         value={sponsor.event} color={COLORS.text} />
        <DetailStat label="TIER"          value={sponsor.tier}  color={COLORS.orange} />
        <DetailStat label="DEAL VALUE"    value={sponsor.value ? `$${(sponsor.value / 1000).toFixed(0)}K` : '—'} color={COLORS.green} />
        <DetailStat label="LAST OUTBOUND" value={sponsor.lastOutbound ? `${daysSince(sponsor.lastOutbound, now)}D AGO` : '—'} color={COLORS.cyan} />
        <DetailStat label="LAST INBOUND"  value={sponsor.lastInbound  ? `${daysSince(sponsor.lastInbound, now)}D AGO`  : '—'} color={COLORS.cyan} />
        <DetailStat
          label="FOLLOW-UP"
          value={sponsor.followUpDue ? formatFollowUp(sponsor.followUpDue, now) : '—'}
          color={sponsor.followUpDue && new Date(sponsor.followUpDue) < now ? COLORS.red : COLORS.yellow}
        />
        <DetailStat label="THREADS" value={sponsor.threadCount ?? 0} color={COLORS.text} />
      </div>

      {sponsor.notes && (
        <div style={styles.detailNotes}>
          <div style={styles.detailNotesLabel}>NOTES</div>
          <div style={styles.detailNotesText}>{sponsor.notes}</div>
        </div>
      )}

      <div style={styles.detailActions}>
        <button
          style={{ ...styles.actionBtn, color: COLORS.cyan, borderColor: COLORS.cyanDim }}
          onClick={() => onMark(sponsor.id)}
          disabled={sponsor.stage === 'BLOCKED'}
        >
          <Send size={11} /> MARK FOLLOWED UP
        </button>
        {sponsor.threadIds?.[0] && (
          <a
            href={`https://mail.google.com/mail/u/0/#inbox/${sponsor.threadIds[0]}`}
            target="_blank" rel="noreferrer"
            style={{ ...styles.actionBtn, color: COLORS.green, borderColor: COLORS.greenDim, textDecoration: 'none' }}
          >
            <ArrowUpRight size={11} /> OPEN THREAD
          </a>
        )}
        <button style={{ ...styles.actionBtn, color: COLORS.orange, borderColor: COLORS.orangeDim }}>
          <Calendar size={11} /> SCHEDULE
        </button>
      </div>
    </Panel>
  );
}

function DetailStat({ label, value, color }) {
  return (
    <div style={styles.detailStat}>
      <div style={styles.detailStatLabel}>{label}</div>
      <div style={{ ...styles.detailStatValue, color }}>{value}</div>
    </div>
  );
}

/* ============================================================
   JARVIS CHAT
   ============================================================ */
function JarvisPanel({ open, setOpen, sponsor, stats }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [model, setModel] = useState(null);
  const scrollRef = useRef(null);

  // Seed greeting once we have stats
  useEffect(() => {
    if (messages.length === 0 && stats.total > 0) {
      setMessages([{
        role: 'jarvis',
        content:
          "Good day, Mr. Michelon. Outreach intelligence layer online. I'm tracking " +
          `${stats.total} sponsor threads. ` +
          (stats.overdue.length
            ? `${stats.overdue.length} follow-up${stats.overdue.length === 1 ? ' is' : 's are'} overdue.`
            : 'All follow-ups on schedule.'),
      }]);
    }
  }, [stats.total, stats.overdue.length, messages.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setThinking(true);
    try {
      const res = await api.jarvis(next);
      setMessages([...next, { role: 'jarvis', content: res.text }]);
      setModel(res.model);
    } catch (err) {
      setMessages([...next, { role: 'jarvis', content: `Comm error: ${err.message}` }]);
    } finally {
      setThinking(false);
    }
  };

  const liveHint = model === 'simulated'
    ? 'Simulated mode. Set ANTHROPIC_API_KEY to enable live JARVIS.'
    : model
    ? `Live · ${model}`
    : 'Ready.';

  return (
    <Panel
      title="J.A.R.V.I.S."
      icon={Cpu}
      accent={COLORS.cyan}
      right={<button onClick={() => setOpen(!open)} style={styles.collapseBtn}>{open ? '−' : '+'}</button>}
    >
      {open && (
        <>
          <div ref={scrollRef} style={styles.chatLog}>
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} text={m.content} />
            ))}
            {thinking && <ChatBubble role="jarvis" text="…" />}
          </div>
          <div style={styles.chatInputRow}>
            <input
              value={input}
              placeholder={sponsor ? `ask about ${sponsor.name}...` : 'ask jarvis...'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              style={styles.chatInput}
            />
            <button onClick={send} style={styles.chatSend}><Send size={12} /></button>
          </div>
          <div style={styles.chatHint}>
            <Sparkles size={9} /> {liveHint}
          </div>
        </>
      )}
    </Panel>
  );
}

function ChatBubble({ role, text }) {
  const isUser = role === 'user';
  return (
    <div style={{ ...styles.chatBubble, alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={styles.chatBubbleLabel}>{isUser ? 'SHANE' : 'JARVIS'}</div>
      <div style={{
        ...styles.chatBubbleText,
        color: isUser ? COLORS.orange : COLORS.cyan,
        borderColor: isUser ? COLORS.orangeDim : COLORS.cyanDim,
        whiteSpace: 'pre-wrap',
      }}>
        {text}
      </div>
    </div>
  );
}

/* ============================================================
   UTILS
   ============================================================ */
function computeStats(sponsors, now) {
  const closed = sponsors.filter((s) => s.stage === 'CLOSED');
  const inDeal = sponsors.filter((s) => s.stage === 'IN_DEAL');
  const engaged = sponsors.filter((s) => s.stage === 'ENGAGED');
  const cold = sponsors.filter((s) => s.stage === 'COLD');
  const closedValue = closed.reduce((a, s) => a + (s.value || 0), 0);
  const pipelineValue = inDeal.reduce((a, s) => a + (s.value || 0), 0);
  const overdue = sponsors.filter(
    (s) => s.followUpDue && new Date(s.followUpDue) < now && s.stage !== 'CLOSED' && s.stage !== 'BLOCKED'
  );
  const dueSoon = sponsors.filter((s) => {
    if (!s.followUpDue) return false;
    const due = new Date(s.followUpDue);
    const days = (due - now) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 3 && s.stage !== 'CLOSED';
  });
  return {
    closed: closed.length, inDeal: inDeal.length, engaged: engaged.length, cold: cold.length,
    closedValue, pipelineValue, overdue, dueSoon, total: sponsors.length,
  };
}

function daysSince(iso, now = new Date()) {
  if (!iso) return null;
  return Math.floor((now - new Date(iso)) / (1000 * 60 * 60 * 24));
}

function formatFollowUp(iso, now = new Date()) {
  const delta = Math.round((new Date(iso) - now) / (1000 * 60 * 60 * 24));
  if (delta < 0) return `${Math.abs(delta)}D LATE`;
  if (delta === 0) return 'TODAY';
  return `IN ${delta}D`;
}

function relativeTime(iso, now = new Date()) {
  const seconds = Math.floor((now - new Date(iso)) / 1000);
  if (seconds < 5) return 'JUST NOW';
  if (seconds < 60) return `${seconds}S AGO`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}M AGO`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}H AGO`;
  return `${Math.floor(seconds / 86400)}D AGO`;
}

/* ============================================================
   KEYFRAMES
   ============================================================ */
function GlobalKeyframes() {
  return (
    <style>{`
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      @keyframes flicker { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.94); } }
      @keyframes scan { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes drift { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(20px, -20px); } }
      input::placeholder { color: ${COLORS.textDim}; }
      button { cursor: pointer; }
      button:disabled { opacity: 0.4; cursor: not-allowed; }
      code { background: rgba(0,0,0,0.4); padding: 1px 5px; border-radius: 2px; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: ${COLORS.cyanDim}; border-radius: 3px; }
    `}</style>
  );
}

/* ============================================================
   STYLES
   ============================================================ */
const styles = {
  shell: { minHeight: '100vh', color: COLORS.text, fontFamily: FONT_MONO, fontSize: 12, padding: 16, boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  bgGrid: {
    position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
    backgroundImage: `linear-gradient(${COLORS.cyanFaint} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.cyanFaint} 1px, transparent 1px)`,
    backgroundSize: '48px 48px', opacity: 0.5,
  },
  bgGlow1: { position: 'fixed', top: '-10%', left: '-10%', width: 600, height: 600, background: `radial-gradient(circle, ${COLORS.cyanGlow} 0%, transparent 60%)`, filter: 'blur(80px)', opacity: 0.25, pointerEvents: 'none', zIndex: 0, animation: 'drift 14s ease-in-out infinite' },
  bgGlow2: { position: 'fixed', bottom: '-10%', right: '-10%', width: 600, height: 600, background: `radial-gradient(circle, ${COLORS.orange} 0%, transparent 60%)`, filter: 'blur(80px)', opacity: 0.15, pointerEvents: 'none', zIndex: 0, animation: 'drift 18s ease-in-out infinite reverse' },
  bgScanline: { position: 'fixed', left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${COLORS.cyanGlow}, transparent)`, pointerEvents: 'none', zIndex: 1, opacity: 0.4, animation: 'scan 8s linear infinite' },

  topBar: { position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', marginBottom: 16, background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 4, backdropFilter: 'blur(8px)' },
  topLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  topCenter: { display: 'flex', gap: 8, alignItems: 'center' },
  topRight: { textAlign: 'right' },
  brand: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, color: COLORS.cyan, letterSpacing: '0.12em', textShadow: `0 0 12px ${COLORS.cyanGlow}` },
  brandSub: { fontSize: 9, color: COLORS.textDim, letterSpacing: '0.22em', marginTop: 2 },
  clock: { fontFamily: FONT_DISPLAY, fontSize: 20, color: COLORS.cyan, letterSpacing: '0.12em', textShadow: `0 0 8px ${COLORS.cyanGlow}` },
  clockDate: { fontSize: 9, color: COLORS.textDim, letterSpacing: '0.2em', marginTop: 2 },
  clockUser: { fontSize: 9, color: COLORS.orange, letterSpacing: '0.18em', marginTop: 2 },
  clockSync: { fontSize: 8, color: COLORS.textDim, letterSpacing: '0.18em', marginTop: 2 },
  reactorMini: { position: 'relative', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  reactorCore: { width: 12, height: 12, borderRadius: '50%', background: COLORS.cyan, boxShadow: `0 0 14px ${COLORS.cyan}, 0 0 26px ${COLORS.cyanGlow}` },
  reactorRing: { position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${COLORS.cyan}`, borderTopColor: 'transparent', animation: 'spin 4s linear infinite' },
  pill: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: '1px solid', borderRadius: 2, fontSize: 9, letterSpacing: '0.16em', background: 'rgba(0,0,0,0.3)' },
  iconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: '1px solid', borderRadius: 2, background: 'rgba(0,0,0,0.3)' },

  banner: { position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 12, background: COLORS.bgPanel, border: '1px solid', borderRadius: 4, fontSize: 11, letterSpacing: '0.04em' },
  bannerClose: { background: 'transparent', border: 'none', color: 'inherit', display: 'flex', alignItems: 'center' },

  mainGrid: { position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr', gap: 16, alignItems: 'start' },
  col: { display: 'flex', flexDirection: 'column', gap: 16 },

  panel: { position: 'relative', background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 4, backdropFilter: 'blur(8px)', overflow: 'hidden' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid', fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 10, background: 'rgba(0,0,0,0.25)' },
  panelHeaderLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  panelBody: { padding: 14 },

  kpiGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  kpiCard: { border: '1px solid', padding: 10, background: 'rgba(0,0,0,0.2)', position: 'relative' },
  kpiLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '0.18em', marginBottom: 6 },
  kpiValue: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, letterSpacing: '0.04em' },
  kpiSub: { fontSize: 8, color: COLORS.textDim, letterSpacing: '0.18em', marginTop: 2 },
  kpiBar: { height: 2, marginTop: 8, borderRadius: 1, overflow: 'hidden' },
  kpiBarFill: { height: '100%' },

  emptyMsg: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: COLORS.textDim, fontSize: 10, letterSpacing: '0.14em' },

  followList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' },
  followItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid', borderRadius: 2, background: 'rgba(0,0,0,0.2)', cursor: 'pointer', transition: 'background 0.15s' },
  followLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  followDot: { width: 6, height: 6, borderRadius: '50%' },
  followName: { fontSize: 12, color: COLORS.text, fontWeight: 600 },
  followMeta: { fontSize: 9, color: COLORS.textDim, letterSpacing: '0.1em', display: 'flex', gap: 5, marginTop: 2 },
  followRight: { display: 'flex', alignItems: 'center', gap: 8 },
  followBadge: { border: '1px solid', padding: '3px 7px', fontSize: 9, letterSpacing: '0.14em', borderRadius: 2 },
  followBtn: { background: 'transparent', border: `1px solid ${COLORS.cyanDim}`, color: COLORS.cyan, padding: 5, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' },

  rulesList: { display: 'flex', flexDirection: 'column', gap: 8 },
  ruleRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: COLORS.text, letterSpacing: '0.04em', padding: '4px 0' },

  pipelineControls: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${COLORS.border}`, padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 2 },
  searchInput: { background: 'transparent', border: 'none', outline: 'none', color: COLORS.text, fontFamily: FONT_MONO, fontSize: 11, flex: 1 },
  tabs: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  tab: { border: '1px solid', padding: '4px 9px', fontSize: 9, letterSpacing: '0.16em', fontFamily: FONT_MONO, fontWeight: 600, borderRadius: 2, background: 'transparent', transition: 'all 0.12s' },

  pipelineList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' },
  row: { position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 14px', border: '1px solid', borderRadius: 2, cursor: 'pointer', transition: 'all 0.12s' },
  rowStageBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rowName: { fontSize: 13, fontWeight: 600, color: COLORS.text, letterSpacing: '0.02em' },
  rowStage: { border: '1px solid', padding: '2px 7px', fontSize: 8, letterSpacing: '0.18em', borderRadius: 2 },
  rowMeta: { display: 'flex', gap: 10, fontSize: 9.5, letterSpacing: '0.06em', alignItems: 'center', marginTop: 2 },

  bounceRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  bounceLabel: { fontSize: 9, color: COLORS.red, letterSpacing: '0.2em' },
  bounceValue: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 36, color: COLORS.red, textShadow: `0 0 12px ${COLORS.redDim}`, marginTop: 4 },
  bounceSub: { fontSize: 9, color: COLORS.textDim, letterSpacing: '0.14em', marginTop: 2 },
  bounceVisual: { width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${COLORS.redDim}`, borderRadius: '50%', background: 'rgba(255, 77, 109, 0.06)' },

  detailStage: { border: '1px solid', padding: '2px 8px', fontSize: 9, letterSpacing: '0.18em', borderRadius: 2 },
  detailName: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22, color: COLORS.cyan, letterSpacing: '0.04em', textShadow: `0 0 10px ${COLORS.cyanGlow}` },
  detailContact: { fontSize: 10.5, color: COLORS.textDim, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 },
  detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 },
  detailStat: { border: `1px solid ${COLORS.border}`, padding: 8, background: 'rgba(0,0,0,0.2)' },
  detailStatLabel: { fontSize: 8, color: COLORS.textDim, letterSpacing: '0.18em' },
  detailStatValue: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, letterSpacing: '0.04em', marginTop: 3 },
  detailNotes: { marginTop: 12, padding: 10, border: `1px solid ${COLORS.orangeDim}`, background: 'rgba(255, 154, 60, 0.05)' },
  detailNotesLabel: { fontSize: 8, color: COLORS.orange, letterSpacing: '0.2em' },
  detailNotesText: { fontSize: 11, color: COLORS.text, marginTop: 4, lineHeight: 1.5 },
  detailActions: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  actionBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid', padding: '6px 10px', fontSize: 9, letterSpacing: '0.14em', fontFamily: FONT_MONO, fontWeight: 600, borderRadius: 2 },

  chatLog: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 10, paddingRight: 4 },
  chatBubble: { maxWidth: '92%' },
  chatBubbleLabel: { fontSize: 8, color: COLORS.textDim, letterSpacing: '0.18em', marginBottom: 3 },
  chatBubbleText: { fontSize: 11, lineHeight: 1.5, border: '1px solid', borderRadius: 2, padding: '7px 10px', background: 'rgba(0,0,0,0.3)' },
  chatInputRow: { display: 'flex', gap: 6 },
  chatInput: { flex: 1, background: 'rgba(0,0,0,0.3)', border: `1px solid ${COLORS.cyanDim}`, color: COLORS.text, fontFamily: FONT_MONO, fontSize: 11, padding: '7px 10px', outline: 'none', borderRadius: 2 },
  chatSend: { background: COLORS.cyan, color: COLORS.bg, border: 'none', padding: '0 12px', display: 'flex', alignItems: 'center', borderRadius: 2 },
  chatHint: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8, color: COLORS.textDim, letterSpacing: '0.14em', marginTop: 8 },
  collapseBtn: { background: 'transparent', border: `1px solid ${COLORS.cyanDim}`, color: COLORS.cyan, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, fontSize: 14, lineHeight: 1 },
};
