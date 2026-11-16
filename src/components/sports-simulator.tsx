'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Clock, LoaderCircle, LockKeyhole, RefreshCw, Sparkles, Trophy, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card, Empty, PageTitle } from './ui/kit';
import { balances, money, parseAmount, pendingPicks, placePick, riskStatus, scenarioError, scenarioMetrics, type Outcome, type Portfolio, type Scenario, type SportsPick } from '@/lib/engine';
import { ODDS_SOURCE, ODDS_SPORTS, fairMultiplier, oddsBoardSchema, type OddsBoard, type OddsGame } from '@/lib/odds';

type Pick = { game: OddsGame; teamId: string };
type Props = { state: Portfolio; mutate: (fn: (state: Portfolio) => Portfolio) => Promise<void>; notify: (text: string) => void; onReview: () => void; onScenarioChange: (scenario: Scenario | undefined) => void };
const percent = (p: number | null) => p === null ? '—' : `${Math.round(p * 100)}%`;
const clock = (at: string) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayKey = (at: string) => new Date(at).toLocaleDateString('en-CA');
function dayLabel(at: string) {
  const d = dayKey(at), today = dayKey(new Date().toISOString()), tomorrow = dayKey(new Date(Date.now() + 86400000).toISOString());
  return d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : new Date(at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
const when = (g: OddsGame) => g.timeKnown ? `${dayLabel(g.startsAt)} · ${clock(g.startsAt)}` : dayLabel(g.startsAt);
const sourceText = (t: OddsGame['teams'][number]) => [t.sources.polymarket !== undefined && `Polymarket ${percent(t.sources.polymarket)}`, t.sources.kalshi !== undefined && `Kalshi ${percent(t.sources.kalshi)}`].filter(Boolean).join(' · ');

export function SportsSimulator({ state, mutate, notify, onReview, onScenarioChange }: Props) {
  const [board, setBoard] = useState<OddsBoard | null>(null), [loading, setLoading] = useState(true), [feedError, setFeedError] = useState('');
  const [sport, setSport] = useState('All'), [pick, setPick] = useState<Pick | null>(null);
  const [stake, setStake] = useState('0.10'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [placed, setPlaced] = useState<SportsPick | null>(null);
  const [asking, setAsking] = useState(false), [explanation, setExplanation] = useState('');
  const feedAbort = useRef<AbortController | null>(null), explanationAbort = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    feedAbort.current?.abort();
    const controller = new AbortController(); feedAbort.current = controller;
    setLoading(true);
    try {
      const response = await fetch('/api/odds', { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Odds are unavailable.');
      const next = oddsBoardSchema.parse(data);
      setBoard(next); setFeedError('');
      // Keep the pick in sync with the latest market prices.
      setPick(current => current && { ...current, game: next.games.find(game => game.id === current.game.id) ?? current.game });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setFeedError(cause instanceof Error ? cause.message : 'Odds are unavailable.');
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
    const chosen = pick?.game.teams.find(team => team.id === pick.teamId);
    const leg = pick && chosen && { eventId: pick.game.id, event: pick.game.name, teamId: chosen.id, team: chosen.name, league: pick.game.league,
      startsAt: pick.game.startsAt, status: 'Upcoming', source: ODDS_SOURCE,
      probability: chosen.probability, multiplier: fairMultiplier(chosen.probability), odds: chosen.sources, settle: chosen.settle };
    return { event: leg?.event ?? 'No game selected', probability: leg?.probability ?? .5, secondProbability: .5,
      multiplier: leg?.multiplier ?? 1, stakeCents, combined: false, independent: false, legs: leg ? [leg] : undefined };
  }, [pick, stake]);
  const signature = JSON.stringify(scenario);
  useEffect(() => {
    onScenarioChange(pick ? scenario : undefined);
    setExplanation(''); setPlaced(null); setError(''); explanationAbort.current?.abort(); setAsking(false);
  // The serialized value avoids resets when a refresh returns identical games.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, onScenarioChange]);

  const b = balances(state), r = riskStatus(state);
  const metrics = pick && scenario.stakeCents > 0 ? scenarioMetrics(scenario) : null;
  const fresh = !!board && Date.now() - Date.parse(board.fetchedAt) < 180_000;
  const pickCurrent = !!pick && fresh && board.games.some(game => game.id === pick.game.id);
  const selectionIssue = !pick ? 'Pick a game first.' : !pickCurrent ? 'This game’s odds are no longer available. Pick another game.' : '';
  const issue = selectionIssue || scenarioError(state, scenario);
  const chosen = pick?.game.teams.find(t => t.id === pick.teamId);

  async function run(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    if (selectionIssue) { setError(selectionIssue); return; }
    setBusy(true); setError('');
    try {
      let made: SportsPick | undefined, blocked: string | undefined;
      await mutate(current => { const next = placePick(current, scenario); made = next.pick; blocked = next.error; return next.state; });
      if (blocked) { setError(blocked); setPlaced(null); }
      else if (made) { setPlaced(made); notify(`Pick placed on ${made.scenario.legs?.[0]?.team}. It settles when the game ends.`); }
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function explain() {
    explanationAbort.current?.abort(); const controller = new AbortController(); explanationAbort.current = controller;
    setAsking(true);
    try {
      const response = await fetch('/api/advisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ question: 'Explain my selected team, the prediction-market chance, the payout multiplier, expected value, maximum loss, and virtual budget impact.', portfolio: state, scenario }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setExplanation(data.answer);
    } catch (cause) { if (!controller.signal.aborted) setExplanation(`Explanation unavailable: ${(cause as Error).message}`); }
    finally { if (!controller.signal.aborted) setAsking(false); }
  }

  const games = board ? board.games.filter(game => sport === 'All' || game.sport === sport) : [];
  const days = games.reduce<{ label: string; games: OddsGame[] }[]>((list, game) => {
    const label = dayLabel(game.startsAt), last = list.at(-1);
    if (last?.label === label) last.games.push(game); else list.push({ label, games: [game] });
    return list;
  }, []);
  const history = state.ledger.filter((entry): entry is Outcome => entry.kind === 'outcome').slice(-6).reverse();
  const waiting = pendingPicks(state).slice().reverse();

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
      <Card title="1. Pick an upcoming game" action={<button type="button" className="icon-btn" aria-label="Refresh odds" onClick={() => void refresh()} disabled={loading}><RefreshCw size={17} className={loading ? 'spin' : ''} /></button>}>
        <div className="segmented segmented-sm sl-filter" aria-label="Filter by sport">{['All', ...ODDS_SPORTS].map(name => <button key={name} type="button" className={sport === name ? 'selected' : ''} aria-pressed={sport === name} onClick={() => setSport(name)}>{name}</button>)}</div>
        {loading && !board && <div className="sl-loading" role="status"><LoaderCircle size={18} className="spin" />Loading games and odds…</div>}
        {feedError && <div className="notice notice-error" role="alert"><p>Couldn’t load odds right now.</p><Button size="sm" variant="outline" onClick={() => void refresh()}>Try again</Button></div>}
        {board && !games.length && <Empty icon={Trophy} title="No upcoming games" description={sport === 'All' ? 'No games with odds in the next week. Check back later.' : `No ${sport} games with odds this week. Try another sport.`} />}
        <div className="sl-games">{days.map(day => <div key={day.label} className="sl-day">
          <h3>{day.label}</h3>
          {day.games.map(game => {
            const selected = pick?.game.id === game.id;
            return <button type="button" key={game.id} className={`sl-game ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => setPick({ game, teamId: [...game.teams].sort((a, b) => b.probability - a.probability)[0].id })}>
              <span className="sl-teams">{game.teams.map(t => <span key={t.id}><span>{t.name}</span><b>{percent(t.probability)}</b></span>)}</span>
              <span className="sl-when"><span className="sl-status">{game.timeKnown ? clock(game.startsAt) : 'Time TBA'}</span><small>{game.sport === 'Soccer' ? game.league : game.sport}</small></span>
            </button>;
          })}
        </div>)}</div>
        <p className="footnote">Win chances from Polymarket and Kalshi prediction markets · updates every minute</p>
      </Card>

      <Card title="2. Make your pick" className="sl-pick">
        {!pick ? <Empty icon={Trophy} title="Choose a game" description="Tap any game to make a pretend pick." /> :
        <form className="stack" onSubmit={run}>
          <div className="sl-picked"><div><strong>{pick.game.name}</strong><span>{pick.game.league} · {when(pick.game)}</span></div><button type="button" className="icon-btn" aria-label="Clear pick" onClick={() => setPick(null)}><X size={17} /></button></div>

          <div className="field">Who will win?
            <div className="sl-choice">{pick.game.teams.map(t => <button type="button" key={t.id} className={pick.teamId === t.id ? 'selected' : ''} aria-pressed={pick.teamId === t.id} onClick={() => setPick({ ...pick, teamId: t.id })}>
              <span>{t.name}</span><small>{percent(t.probability)} chance · pays {fairMultiplier(t.probability).toFixed(2)}×</small>
            </button>)}</div>
            {pick.game.sport === 'Soccer' && <small className="muted">A draw counts as a loss{pick.game.draw !== undefined ? ` (markets give a draw ${percent(pick.game.draw)})` : ''}.</small>}
          </div>

          {chosen && <p className="sl-odds">Markets give {chosen.name} a <strong>{percent(chosen.probability)}</strong> chance, so a win pays <strong>{fairMultiplier(chosen.probability).toFixed(2)}×</strong>. <span>{sourceText(chosen)}</span></p>}

          <label className="field">Amount<div className="money-field"><span>$</span><input inputMode="decimal" value={stake} onChange={e => setStake(e.target.value)} aria-label="Pretend amount" required /></div>
            <button type="button" className="link-btn sl-max" onClick={() => setStake((r.maxStake / 100).toFixed(2))}>Use max ({money(r.maxStake)})</button></label>

          <div className="sl-summary">
            <div><span>If {chosen?.name} wins</span><strong className="up">{metrics ? `+${money(metrics.profit)}` : '—'}</strong></div>
            <div><span>If they lose</span><strong className="down">−{money(scenario.stakeCents)}</strong></div>
          </div>

          {(error || issue) && <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : undefined}><p>{error || issue}</p></div>}
          {placed && <div className="sl-result won" role="status"><Clock size={20} /><div><strong>Pick placed!</strong><p>We’ll check the real result after the game and pay out automatically. You can see it under “Waiting for results.”</p></div></div>}
          <Button type="submit" className="full-width btn-lg" disabled={busy || !!issue}>{busy ? <LoaderCircle size={17} className="spin" /> : <Trophy size={17} />}Place pretend pick</Button>

          <details className="sl-math"><summary>Show the math</summary>
            <dl>
              <div><dt>Total payout if right</dt><dd>{metrics ? money(metrics.payout) : '—'}</dd></div>
              <div><dt>Market chance</dt><dd>{metrics ? percent(metrics.probability) : '—'}</dd></div>
              <div><dt>Break-even chance</dt><dd>{metrics ? percent(metrics.implied) : '—'}</dd></div>
              <div><dt>Average result per pick</dt><dd className={metrics?.ev != null && metrics.ev >= 0 ? 'up' : 'down'}>{metrics?.ev == null ? '—' : `${metrics.ev >= 0 ? '+' : '−'}${money(Math.abs(metrics.ev))}`}</dd></div>
            </dl>
            <p className="muted">Payouts match the market odds, so on average you break even (slightly less after rounding). Any single pick can lose the full amount. Picks settle on the real final result.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void explain()} disabled={asking || !metrics}>{asking ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}Explain this in plain English</Button>
            {explanation && <p className="sl-explain" role="status">{explanation}</p>}
          </details>
        </form>}
      </Card>
    </div>

    {waiting.length > 0 && <Card title="Waiting for results">
      <ul className="sl-history">{waiting.map(p => { const leg = p.scenario.legs![0]; return <li key={p.id}>
        <span className="sl-dot lost"><Clock size={15} /></span>
        <div><strong>{leg.team}<span className="sl-hist-odds"> · {percent(leg.probability)}</span></strong><small>{p.scenario.event} · {Date.parse(leg.startsAt) > Date.now() ? `starts ${dayLabel(leg.startsAt).toLowerCase()} ${clock(leg.startsAt)}` : 'game in progress or finished; checking result'}</small></div>
        <span className="sl-pending"><strong>{money(p.scenario.stakeCents)}</strong><small>to win {money(scenarioMetrics(p.scenario).payout)}</small></span>
      </li>; })}</ul>
    </Card>}

    <Card title="Past picks">
      {history.length ? <ul className="sl-history">{history.map(entry => <li key={entry.id}>
        <span className={`sl-dot ${entry.won ? 'won' : 'lost'}`}><Trophy size={15} /></span>
        <div><strong>{entry.scenario.legs?.map(leg => leg.team).join(' + ') ?? 'Practice pick'}{entry.scenario.legs?.[0] && <span className="sl-hist-odds"> · {percent(entry.scenario.legs[0].probability)}</span>}</strong><small>{entry.scenario.legs ? entry.scenario.event : 'Sample data'}{entry.pickId ? ' · real result' : entry.scenario.legs?.[0]?.source === 'Prediction markets' ? ' · instant' : ''} · {new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></div>
        {entry.void ? <strong className="muted">Refunded</strong> : <strong className={entry.netCents >= 0 ? 'up' : 'down'}>{entry.netCents >= 0 ? '+' : '−'}{money(Math.abs(entry.netCents))}</strong>}
      </li>)}</ul> : <Empty icon={Trophy} title="No picks yet" description="Your pretend picks will show up here." />}
    </Card>
  </>;
}
