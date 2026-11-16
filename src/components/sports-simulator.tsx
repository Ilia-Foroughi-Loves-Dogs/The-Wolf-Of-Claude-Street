'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, LoaderCircle, LockKeyhole, RefreshCw, Sparkles, Trophy, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card, Empty, PageTitle } from './ui/kit';
import { balances, money, parseAmount, PROBABILITY_OPTIONS, riskStatus, scenarioError, scenarioMetrics, simulate, type Outcome, type Portfolio, type Scenario } from '@/lib/engine';
import { localDate, scheduleSchema, SPORTS, type Schedule, type SportsEvent } from '@/lib/sports';

type Pick = { game: SportsEvent; teamId: string; probability: number; multiplier: string };
type Props = { state: Portfolio; mutate: (fn: (state: Portfolio) => Portfolio) => Promise<void>; notify: (text: string) => void; onReview: () => void; onScenarioChange: (scenario: Scenario | undefined) => void };
const percent = (p: number | null) => p === null ? '—' : `${Math.round(p * 1000) / 10}%`;
const clock = (at: string) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function SportsSimulator({ state, mutate, notify, onReview, onScenarioChange }: Props) {
  const [schedule, setSchedule] = useState<Schedule | null>(null), [loading, setLoading] = useState(true), [feedError, setFeedError] = useState('');
  const [sport, setSport] = useState('All'), [pick, setPick] = useState<Pick | null>(null);
  const [stake, setStake] = useState('0.10'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<Outcome | null>(null);
  const [asking, setAsking] = useState(false), [explanation, setExplanation] = useState('');
  const feedAbort = useRef<AbortController | null>(null), explanationAbort = useRef<AbortController | null>(null);
  const [zone, setZone] = useState('UTC');

  const refresh = useCallback(async () => {
    feedAbort.current?.abort();
    const controller = new AbortController(); feedAbort.current = controller;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setZone(timeZone); setLoading(true);
    try {
      const response = await fetch(`/api/sports?timezone=${encodeURIComponent(timeZone)}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sports schedules are unavailable.');
      const next = scheduleSchema.parse(data);
      setSchedule(next); setFeedError('');
      setPick(current => current && { ...current, game: next.events.find(game => game.id === current.game.id) ?? current.game });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setSchedule(null); setFeedError(cause instanceof Error ? cause.message : 'Sports schedules are unavailable.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); feedAbort.current?.abort(); explanationAbort.current?.abort(); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);

  const scenario = useMemo<Scenario>(() => {
    let stakeCents = 0;
    try { stakeCents = parseAmount(stake); } catch { /* Invalid input never reaches settlement. */ }
    const leg = pick && { eventId: pick.game.id, event: pick.game.name, teamId: pick.teamId,
      team: pick.game.teams.find(team => team.id === pick.teamId)?.name ?? '', league: pick.game.league,
      startsAt: pick.game.startsAt, status: pick.game.status, source: 'ESPN public scoreboard' as const,
      probability: pick.probability, multiplier: Number(pick.multiplier) };
    return { event: leg?.event ?? 'No game selected', probability: leg?.probability ?? .5, secondProbability: .5,
      multiplier: leg?.multiplier ?? 1, stakeCents, combined: false, independent: false, legs: leg ? [leg] : undefined };
  }, [pick, stake]);
  const signature = JSON.stringify(scenario);
  useEffect(() => {
    onScenarioChange(pick ? scenario : undefined);
    setExplanation(''); setResult(null); setError(''); explanationAbort.current?.abort(); setAsking(false);
  // The serialized value avoids resets when a refresh returns identical games.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, onScenarioChange]);

  const b = balances(state), r = riskStatus(state);
  const multiplierOk = !!pick && Number.isFinite(Number(pick.multiplier)) && Number(pick.multiplier) >= 1.01 && Number(pick.multiplier) <= 100;
  const metrics = multiplierOk && scenario.stakeCents > 0 ? scenarioMetrics(scenario) : null;
  const today = localDate(new Date(), zone);
  const feedCurrent = !!schedule && schedule.date === today && Date.now() - Date.parse(schedule.fetchedAt) < 120_000;
  const pickCurrent = !!pick && feedCurrent && schedule.events.some(game => game.id === pick.game.id);
  const selectionIssue = !pick ? 'Pick a game first.' : !pickCurrent ? 'This game is no longer in today’s schedule. Refresh or pick another.' : ['Postponed', 'Canceled', 'Delayed'].includes(pick.game.status) ? `This game is ${pick.game.status.toLowerCase()}. Pick another one.` : !multiplierOk ? 'Set the payout between 1.01× and 100×.' : '';
  const issue = selectionIssue || scenarioError(state, scenario);
  const team = pick?.game.teams.find(t => t.id === pick.teamId)?.name;
  const update = (change: Partial<Pick>) => setPick(current => current && { ...current, ...change });

  async function run(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    if (selectionIssue) { setError(selectionIssue); return; }
    setBusy(true); setError('');
    try {
      let outcome: Outcome | undefined, blocked: string | undefined;
      await mutate(current => { const next = simulate(current, scenario); outcome = next.outcome; blocked = next.error; return next.state; });
      if (blocked) { setError(blocked); setResult(null); }
      else if (outcome) { setResult(outcome); notify(outcome.won ? 'Your pick won (pretend money).' : 'Your pick lost (pretend money). Savings untouched.'); }
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function explain() {
    explanationAbort.current?.abort(); const controller = new AbortController(); explanationAbort.current = controller;
    setAsking(true);
    try {
      const response = await fetch('/api/advisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ question: 'Explain my selected team, assumed probability, illustrative multiplier, expected value, maximum loss, and virtual budget impact. Distinguish real schedule data from assumptions.', portfolio: state, scenario }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setExplanation(data.answer);
    } catch (cause) { if (!controller.signal.aborted) setExplanation(`Explanation unavailable: ${(cause as Error).message}`); }
    finally { if (!controller.signal.aborted) setAsking(false); }
  }

  const games = feedCurrent ? schedule.events.filter(game => sport === 'All' || game.sport === sport) : [];
  const history = state.ledger.filter((entry): entry is Outcome => entry.kind === 'outcome').slice(-6).reverse();

  return <>
    <PageTitle title="Sports Lab" subtitle="Practice picking winners with pretend money. Your savings are never used.">
      <Button variant="outline" onClick={onReview}><CalendarCheck size={16} />Weekly check-in</Button>
    </PageTitle>

    <section className="card sl-stats">
      <div><span>Practice money</span><strong>{money(b.risk)}</strong></div>
      <div><span>Most per pick</span><strong>{money(r.maxStake)}</strong></div>
      <div><span>Can still lose today</span><strong>{money(r.remaining)}</strong></div>
      <div><span>Savings</span><strong className="sl-locked"><LockKeyhole size={14} />{money(b.savings)} safe</strong></div>
    </section>

    <div className="sl-layout">
      <Card title="1. Pick a game" action={<button type="button" className="icon-btn" aria-label="Refresh games" onClick={() => void refresh()} disabled={loading}><RefreshCw size={17} className={loading ? 'spin' : ''} /></button>}>
        <div className="segmented segmented-sm sl-filter" aria-label="Filter by sport">{['All', ...SPORTS].map(name => <button key={name} type="button" className={sport === name ? 'selected' : ''} aria-pressed={sport === name} onClick={() => setSport(name)}>{name}</button>)}</div>
        {loading && !schedule && <div className="sl-loading" role="status"><LoaderCircle size={18} className="spin" />Loading today’s games…</div>}
        {feedError && <div className="notice notice-error" role="alert"><p>Couldn’t load games right now.</p><Button size="sm" variant="outline" onClick={() => void refresh()}>Try again</Button></div>}
        {!loading && !feedError && !games.length && <Empty icon={Trophy} title="No games today" description={sport === 'All' ? 'Check back later for today’s schedule.' : `No ${sport} games today. Try another sport.`} />}
        <div className="sl-games">{games.map(game => {
          const selected = pick?.game.id === game.id, live = game.status === 'Live';
          return <button type="button" key={game.id} className={`sl-game ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => { setPick({ game, teamId: game.teams[0].id, probability: .5, multiplier: '2.00' }); }}>
            <span className="sl-teams">{game.teams.map(t => <span key={t.id}><span>{t.name}</span>{t.score !== undefined && <b>{t.score}</b>}</span>)}</span>
            <span className="sl-when"><span className={`sl-status ${live ? 'live' : ''}`}>{live ? 'Live' : game.status === 'Upcoming' ? clock(game.startsAt) : game.status}</span><small>{game.sport}</small></span>
          </button>;
        })}</div>
        <p className="footnote">Real schedules from ESPN · updates every minute</p>
      </Card>

      <Card title="2. Make your pick" className="sl-pick">
        {!pick ? <Empty icon={Trophy} title="Choose a game" description="Tap any game to make a pretend pick." /> :
        <form className="stack" onSubmit={run}>
          <div className="sl-picked"><div><strong>{pick.game.name}</strong><span>{pick.game.league} · {pick.game.status === 'Upcoming' ? clock(pick.game.startsAt) : pick.game.status}</span></div><button type="button" className="icon-btn" aria-label="Clear pick" onClick={() => setPick(null)}><X size={17} /></button></div>

          <div className="field">Who will win?
            <div className="sl-choice">{pick.game.teams.map(t => <button type="button" key={t.id} className={pick.teamId === t.id ? 'selected' : ''} aria-pressed={pick.teamId === t.id} onClick={() => update({ teamId: t.id })}>{t.name}</button>)}</div>
            {pick.game.sport === 'Soccer' && <small className="muted">A draw counts as a loss.</small>}
          </div>

          <div className="field">How sure are you?
            <div className="sl-sure">{PROBABILITY_OPTIONS.map(p => <button type="button" key={p} className={pick.probability === p / 100 ? 'selected' : ''} aria-pressed={pick.probability === p / 100} aria-label={`${p}% sure`} onClick={() => update({ probability: p / 100 })}>{p}%</button>)}</div>
          </div>

          <div className="form-pair">
            <label className="field">Amount<div className="money-field"><span>$</span><input inputMode="decimal" value={stake} onChange={e => setStake(e.target.value)} aria-label="Pretend amount" required /></div>
              <button type="button" className="link-btn sl-max" onClick={() => setStake((r.maxStake / 100).toFixed(2))}>Use max ({money(r.maxStake)})</button></label>
            <label className="field">Payout if right<div className="money-field sl-times"><input type="number" inputMode="decimal" min="1.01" max="100" step="0.01" value={pick.multiplier} onChange={e => update({ multiplier: e.target.value })} aria-label="Payout multiplier" required /><span>×</span></div>
              <small className="muted">2× turns $1 into $2</small></label>
          </div>

          <div className="sl-summary">
            <div><span>If {team} wins</span><strong className="up">{metrics ? `+${money(metrics.profit)}` : '—'}</strong></div>
            <div><span>If they lose</span><strong className="down">−{money(scenario.stakeCents)}</strong></div>
          </div>

          {(error || issue) && <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : undefined}><p>{error || issue}</p></div>}
          {result && <div className={`sl-result ${result.won ? 'won' : 'lost'}`} role="status"><Trophy size={20} /><div><strong>{result.won ? `You won ${money(result.netCents)}!` : `You lost ${money(Math.abs(result.netCents))}.`}</strong><p>Pretend result — it doesn’t predict the real game.</p></div></div>}
          <Button type="submit" className="full-width btn-lg" disabled={busy || !!issue}>{busy ? <LoaderCircle size={17} className="spin" /> : <Trophy size={17} />}Make pretend pick</Button>

          <details className="sl-math"><summary>Show the math</summary>
            <dl>
              <div><dt>Total payout if right</dt><dd>{metrics ? money(metrics.payout) : '—'}</dd></div>
              <div><dt>Your chance (your guess)</dt><dd>{metrics ? percent(metrics.probability) : '—'}</dd></div>
              <div><dt>Break-even chance</dt><dd>{metrics ? percent(metrics.implied) : '—'}</dd></div>
              <div><dt>Average result per pick</dt><dd className={metrics?.ev != null && metrics.ev >= 0 ? 'up' : 'down'}>{metrics?.ev == null ? '—' : `${metrics.ev >= 0 ? '+' : '−'}${money(Math.abs(metrics.ev))}`}</dd></div>
            </dl>
            <p className="muted">These numbers only hold if your guess is right. You can always lose the full amount.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void explain()} disabled={asking || !metrics}>{asking ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}Explain this in plain English</Button>
            {explanation && <p className="sl-explain" role="status">{explanation}</p>}
          </details>
        </form>}
      </Card>
    </div>

    <Card title="Past picks">
      {history.length ? <ul className="sl-history">{history.map(entry => <li key={entry.id}>
        <span className={`sl-dot ${entry.won ? 'won' : 'lost'}`}><Trophy size={15} /></span>
        <div><strong>{entry.scenario.legs?.map(leg => leg.team).join(' + ') ?? 'Practice pick'}</strong><small>{entry.scenario.legs ? entry.scenario.event : 'Sample data'} · {new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></div>
        <strong className={entry.netCents >= 0 ? 'up' : 'down'}>{entry.netCents >= 0 ? '+' : '−'}{money(Math.abs(entry.netCents))}</strong>
      </li>)}</ul> : <Empty icon={Trophy} title="No picks yet" description="Your pretend picks will show up here." />}
    </Card>
  </>;
}
