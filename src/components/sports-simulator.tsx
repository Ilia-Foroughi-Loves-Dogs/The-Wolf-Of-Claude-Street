'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, FlaskConical, LoaderCircle, LockKeyhole, Radio, RefreshCw, ShieldCheck, Sparkles, Trophy, X } from 'lucide-react';
import { Button } from './ui/button';
import { balances, money, parseAmount, PROBABILITY_OPTIONS, riskStatus, scenarioError, scenarioMetrics, simulate, type Outcome, type Portfolio, type Scenario } from '@/lib/engine';
import { localDate, scheduleSchema, SPORTS, type Schedule, type SportsEvent } from '@/lib/sports';

type Pick = { game: SportsEvent; teamId: string; probability: number; multiplier: string };
type Props = { state: Portfolio; mutate: (fn: (state: Portfolio) => Portfolio) => Promise<void>; notify: (text: string) => void; onReview: () => void; onScenarioChange: (scenario: Scenario | undefined) => void };
const percent = (p: number | null) => p === null ? 'Not modeled' : `${(p * 100).toFixed(p * 100 < 1 ? 4 : 1)}%`;

function ProbabilityControl({ value, onChange, label }: { value: number; onChange: (p: number) => void; label: string }) {
  return <fieldset className="probability-control"><legend>{label} <strong>{Math.round(value * 100)}%</strong></legend>
    <div className="probability-options">{PROBABILITY_OPTIONS.map(p => <button type="button" key={p} aria-label={`${label}: ${p}%`} aria-pressed={value === p / 100} onClick={() => onChange(p / 100)}>{p}%</button>)}</div>
    <div className="probability-track"><span style={{ width: `${value * 100}%` }}/></div>
    <p>Your hypothetical assumption. This is not a sports prediction.</p>
  </fieldset>;
}

export function SportsSimulator({ state, mutate, notify, onReview, onScenarioChange }: Props) {
  const [schedule, setSchedule] = useState<Schedule | null>(null), [loading, setLoading] = useState(true), [feedError, setFeedError] = useState('');
  const [sport, setSport] = useState('All'), [picks, setPicks] = useState<Pick[]>([]), [combinedMode, setCombinedMode] = useState(false);
  const [independent, setIndependent] = useState(false), [manual, setManual] = useState<number | undefined>();
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
      setPicks(current => current.map(pick => ({ ...pick, game: next.events.find(game => game.id === pick.game.id) ?? pick.game })));
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
    const legs = picks.map(pick => ({ eventId: pick.game.id, event: pick.game.name, teamId: pick.teamId,
      team: pick.game.teams.find(team => team.id === pick.teamId)?.name ?? '', league: pick.game.league,
      startsAt: pick.game.startsAt, status: pick.game.status, source: 'ESPN public scoreboard' as const,
      probability: pick.probability, multiplier: Number(pick.multiplier),
    }));
    return { event: legs.length === 1 ? legs[0].event : `${legs.length} real games · combined hypothetical scenario`,
      probability: legs[0]?.probability ?? .5, secondProbability: legs[1]?.probability ?? .5,
      multiplier: legs.reduce((n, leg) => n * leg.multiplier, 1), stakeCents,
      combined: legs.length > 1, independent, legs: legs.length ? legs : undefined,
      ...(!independent && manual !== undefined ? { combinedProbability: manual } : {}),
    };
  }, [picks, stake, independent, manual]);
  const signature = JSON.stringify(scenario);
  useEffect(() => {
    onScenarioChange(picks.length ? scenario : undefined);
    setExplanation(''); setResult(null); setError(''); explanationAbort.current?.abort(); setAsking(false);
  // The serialized value avoids resets when a refresh returns identical games.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, onScenarioChange]);

  const b = balances(state), r = riskStatus(state);
  const validNumbers = picks.length > 0 && picks.every(pick => Number.isFinite(Number(pick.multiplier)) && Number(pick.multiplier) >= 1.01 && Number(pick.multiplier) <= 100) && scenario.multiplier <= 1_000_000 && scenario.stakeCents > 0;
  const metrics = validNumbers ? scenarioMetrics(scenario) : null;
  const today = localDate(new Date(), zone);
  const feedCurrent = !!schedule && schedule.date === today && Date.now() - Date.parse(schedule.fetchedAt) < 120_000;
  const picksCurrent = feedCurrent && picks.every(pick => schedule.events.some(game => game.id === pick.game.id));
  const selectionIssue = !picks.length ? 'Select a real game from today’s schedule to get started.' : !picksCurrent ? 'Selected games could not be verified in the current schedule. Refresh or remove them to continue.' : picks.some(pick => ['Postponed', 'Canceled', 'Delayed'].includes(pick.game.status)) ? 'Remove postponed, canceled, or delayed games to run this scenario.' : '';
  const issue = selectionIssue || scenarioError(state, scenario);
  const updatePick = (index: number, change: Partial<Pick>) => setPicks(current => current.map((pick, i) => i === index ? { ...pick, ...change } : pick));
  function selectGame(game: SportsEvent) {
    const pick: Pick = { game, teamId: game.teams[0].id, probability: .5, multiplier: '2.00' };
    setPicks(current => combinedMode ? current.some(p => p.game.id === game.id) ? current : [...current, pick].slice(0, 8) : [pick]);
    setManual(undefined); setIndependent(false);
  }
  async function run(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    if (selectionIssue) { setError(selectionIssue); return; }
    setBusy(true); setError('');
    try {
      let outcome: Outcome | undefined, blocked: string | undefined;
      await mutate(current => { const next = simulate(current, scenario); outcome = next.outcome; blocked = next.error; return next.state; });
      if (blocked) { setError(blocked); setResult(null); }
      else if (outcome) { setResult(outcome); notify('Virtual outcome recorded. Protected savings stayed unchanged.'); }
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function explain() {
    explanationAbort.current?.abort(); const controller = new AbortController(); explanationAbort.current = controller;
    setAsking(true);
    try {
      const response = await fetch('/api/advisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ question: 'Explain my selected teams, assumed probabilities, illustrative multipliers, expected value, maximum loss, and virtual budget impact. Distinguish real schedule data from assumptions.', portfolio: state, scenario }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setExplanation(`${data.mode === 'demo' ? 'Demo explanation' : 'RoundUp Intelligence · Claude'}\n\n${data.answer}${data.notice ? `\n\n${data.notice}` : ''}`);
    } catch (cause) { if (!controller.signal.aborted) setExplanation(`Explanation unavailable: ${(cause as Error).message}`); }
    finally { if (!controller.signal.aborted) setAsking(false); }
  }
  const games = feedCurrent ? schedule.events.filter(game => sport === 'All' || game.sport === sport) : [];
  const history = state.ledger.filter((entry): entry is Outcome => entry.kind === 'outcome').slice(-8).reverse();
  return <>
    <div className="page-heading"><div><div className="eyebrow">THE WOLF OF CLAUDE STREET · SPORTS LAB</div><h1>Curiosity, with a safety net.</h1><p>Real games. Your assumptions. A strictly virtual budget.</p></div><Button variant="outline" onClick={onReview}><ShieldCheck size={16}/>Review My Risk Limits</Button></div>
    <div className="education-banner"><FlaskConical size={20}/><p><strong>Real schedules. Hypothetical scenarios.</strong> Probabilities and multipliers are your assumptions. All money and outcomes are virtual; simulations do not settle on real game results.</p></div>
    <div className="sports-layout">
      <section className="panel live-sports" aria-label="Live sports">
        <div className="panel-heading"><div><span className="sports-kicker"><Radio size={12}/> TODAY’S SCHEDULE</span><h2>Live sports</h2></div><button className="icon-button" aria-label="Refresh sports" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/></button></div>
        <p className="sports-date">{schedule?.date ?? today} · {zone}<br/>Auto-refresh every 60 seconds{schedule && <> · Updated {new Date(schedule.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>}</p>
        <div className="sport-filters" aria-label="Filter by sport">{['All', ...SPORTS].map(name => <button key={name} aria-pressed={sport === name} onClick={() => setSport(name)}>{name}</button>)}</div>
        {loading && <div className="sports-loading" role="status"><LoaderCircle size={18} className="spin"/> {schedule ? 'Refreshing real schedules…' : 'Loading real games…'}</div>}
        {feedError && <div className="sports-feed-error" role="alert">{feedError}<Button variant="outline" onClick={() => void refresh()}>Retry sports feed</Button></div>}
        {schedule?.warnings.length ? <details className="feed-warnings"><summary>{schedule.warnings.length} league feeds unavailable</summary>{schedule.warnings.map(warning => <p key={warning}>{warning}</p>)}</details> : null}
        {!loading && !feedError && !games.length && <div className="empty"><Trophy size={24}/><h3>No games scheduled today</h3><p>No {sport === 'All' ? 'covered' : sport} events were returned for your local date. Soccer covers the leagues listed below.</p></div>}
        <div className="sports-game-list">{games.map(game => {
          const selected = picks.some(pick => pick.game.id === game.id);
          return <article className={`game-card ${selected ? 'game-selected' : ''}`} key={game.id}>
            <div className="game-meta"><span>{game.sport} · {game.league}</span><span className={`game-status status-${game.status.toLowerCase()}`}>{game.status === 'Live' && <i/>}{game.status}</span></div>
            <div className="game-teams">{game.teams.map(team => <div key={team.id}><strong>{team.name}</strong>{team.score !== undefined && <span>{team.score}</span>}</div>)}</div>
            <div className="game-bottom"><time dateTime={game.startsAt}>{new Date(game.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</time><button aria-label={`${selected ? 'Selected' : 'Select game'}: ${game.name}`} aria-pressed={selected} disabled={selected || combinedMode && picks.length >= 8} onClick={() => selectGame(game)}>{selected ? 'Selected' : 'Select game'}<ArrowRight size={12}/></button></div>
            {game.status !== 'Upcoming' && <p className="game-detail">{game.detail}</p>}
          </article>;
        })}</div>
        <p className="feed-attribution">Source: ESPN public scoreboard · No market odds imported. Soccer: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, MLS, Champions League, UEFA / CONMEBOL qualifiers and international friendlies. Coverage depends on ESPN.</p>
      </section>

      <section className="panel scenario-panel sports-builder" aria-label="Build your scenario">
        <div className="panel-heading"><div><span className="sports-kicker">YOUR WHAT-IF WORKSPACE</span><h2>Build your scenario</h2></div><span className="pill pill-purple">VIRTUAL</span></div>
        <div className="scenario-mode"><button aria-pressed={!combinedMode} onClick={() => { setCombinedMode(false); setPicks(p => p.slice(0, 1)); setManual(undefined); setIndependent(false); }}>Single game</button><button aria-pressed={combinedMode} onClick={() => setCombinedMode(true)}>Combined prediction</button></div>
        <form className="form-stack" onSubmit={run}>
          {!picks.length && <div className="select-game-empty"><Trophy size={30}/><h3>Start with a real game.</h3><p>Select a game from today’s schedule. Your probability starts at 50% and the editable illustrative multiplier at 2.00×.</p></div>}
          {combinedMode && <p className="field-hint">Select up to eight different games. Every chosen team must win in this hypothetical combined model.</p>}
          {picks.map((pick, index) => <section className="scenario-leg" key={pick.game.id} aria-label={`Scenario game ${index + 1}`}>
            <div className="leg-heading"><span>GAME {index + 1} · {pick.game.sport}</span><button type="button" aria-label={`Remove ${pick.game.name}`} onClick={() => { setPicks(p => p.filter(item => item.game.id !== pick.game.id)); setManual(undefined); }}><X size={15}/></button></div>
            <h3>{pick.game.name}</h3><p className="leg-schedule">{pick.game.league} · {pick.game.status} · {new Date(pick.game.startsAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</p>
            {pick.game.status === 'Final' && <p className="amber-text small-text">Final game · retrospective what-if only. The simulated result is unrelated to the actual result.</p>}
            <label>Selected team<select aria-label={`Winning team for game ${index + 1}`} value={pick.teamId} onChange={event => updatePick(index, { teamId: event.target.value })}>{pick.game.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            {pick.game.sport === 'Soccer' && <p className="field-hint">Team-win scenario at regulation time. A draw counts as the selected team not winning.</p>}
            <ProbabilityControl value={pick.probability} onChange={probability => updatePick(index, { probability })} label={`Estimated probability · game ${index + 1}`}/>
            <label>Hypothetical decimal multiplier<div className="input-unit"><input aria-label={`Hypothetical multiplier for game ${index + 1}`} type="number" inputMode="decimal" min="1.01" max="100" step="0.01" value={pick.multiplier} onChange={event => updatePick(index, { multiplier: event.target.value })} required/><span>×</span></div></label>
            <p className="field-hint">Manually editable illustrative multiplier. No verified market odds. Changing probability leaves this multiplier unchanged.</p>
          </section>)}
          {picks.length > 1 && <div className="combined-fields"><h3>How should we model the combination?</h3><label className="checkbox-label"><input type="checkbox" checked={independent} onChange={event => { setIndependent(event.target.checked); setManual(undefined); }}/>I explicitly assume the events are independent.</label>{independent ? <p className="amber-text small-text">Independence is your modeling assumption. Probabilities are multiplied; correlation can make this estimate unreliable.</p> : <><p className="small-text">No independence assumed. Enter a combined probability yourself to calculate expected value. Individual probabilities alone cannot determine it.</p><label>Manual combined probability<select aria-label="Manual combined probability" value={manual === undefined ? '' : Math.round(manual * 100)} onChange={event => setManual(event.target.value ? Number(event.target.value) / 100 : undefined)}><option value="">Choose your assumption</option>{PROBABILITY_OPTIONS.map(p => <option value={p} key={p}>{p}%</option>)}</select></label>{manual !== undefined && manual > Math.min(...picks.map(pick => pick.probability)) && <p className="amber-text small-text">This combined probability exceeds an individual probability. An all-teams-win event cannot be more likely than any one leg; revise your assumptions.</p>}</>}</div>}
          <label>Virtual amount at risk<div className="money-input"><span>$</span><input aria-label="Virtual amount at risk" inputMode="decimal" value={stake} onChange={event => setStake(event.target.value)} required/><button type="button" className="max-button" onClick={() => setStake((r.maxStake / 100).toFixed(2))}>Use max</button></div></label>
          <div className="stake-helper"><span>Budget: {money(b.risk)}</span><span>Scenario cap: <strong>{money(r.maxStake)}</strong></span></div>
          {issue && <div className="limit-preview"><ShieldCheck size={15}/><span>{issue}</span></div>}
          {error && <div className="alert alert-error" role="alert"><strong>Scenario blocked.</strong> {error} No funds moved.</div>}
          <Button type="submit" className="full-width" disabled={busy || !picks.length}>{busy ? <LoaderCircle size={16} className="spin"/> : <FlaskConical size={16}/>}Run virtual simulation</Button>
        </form>
      </section>

      <div className="sports-results"><section className="panel analysis-panel" aria-label="Your results">
        <div className="panel-heading"><div><span className="sports-kicker">INSTANT SCENARIO ANALYSIS</span><h2>Your results</h2></div></div>
        <div className="payout-hero"><span>POTENTIAL TOTAL PAYOUT</span><strong data-testid="potential-payout">{metrics ? money(metrics.payout) : '—'}</strong><p>Includes your original virtual amount · Payout and EV rounded to cents</p></div>
        <dl className="results-list">
          <div><dt>Selected game{picks.length > 1 ? 's' : ''}</dt><dd>{picks.length ? picks.map(pick => pick.game.name).join(' + ') : 'Select a game'}</dd></div>
          <div><dt>Selected team{picks.length > 1 ? 's' : ''}</dt><dd>{picks.length ? picks.map(pick => pick.game.teams.find(team => team.id === pick.teamId)?.name).join(' + ') : '—'}</dd></div>
          <div><dt>{picks.length > 1 ? 'Combined estimated probability' : 'Estimated winning probability'}</dt><dd data-testid="estimated-probability">{metrics ? percent(metrics.probability) : '—'}</dd></div>
          <div><dt>{picks.length > 1 ? 'Combined hypothetical multiplier' : 'Hypothetical decimal multiplier'}</dt><dd data-testid="result-multiplier">{metrics ? `${metrics.multiplier.toFixed(2)}×` : '—'}</dd></div>
          <div><dt>Virtual amount at risk</dt><dd>{money(scenario.stakeCents)}</dd></div>
          <div><dt>Potential net profit</dt><dd className="positive" data-testid="potential-profit">{metrics ? money(metrics.profit) : '—'}</dd></div>
          <div><dt>Maximum potential loss</dt><dd className="amber-text" data-testid="maximum-loss">{money(scenario.stakeCents)}</dd></div>
          <div className="ev-result"><dt>Estimated expected value</dt><dd data-testid="expected-value" className={metrics?.ev !== null && (metrics?.ev ?? 0) >= 0 ? 'positive' : 'amber-text'}>{metrics?.ev === null || !metrics ? 'Not modeled' : `${metrics.ev >= 0 ? '+' : ''}${money(metrics.ev)}`}</dd></div>
          <div><dt>Break-even probability</dt><dd data-testid="break-even">{metrics ? percent(metrics.implied) : '—'}</dd></div>
        </dl>
        <div className="risk-assessment"><strong><ShieldCheck size={15}/>Risk assessment</strong><p>{issue || 'Within your configured virtual exposure and daily loss limits.'}</p><p>You could lose the entire amount. Positive estimated EV is conditional on your assumptions.</p>{picks.length > 1 && <p>{independent ? 'Independence explicitly assumed.' : manual === undefined ? 'Combined probability not provided; EV cannot be calculated.' : 'Manual combined probability; no independence assumed.'}</p>}</div>
        <div className="budget-impact"><span>Virtual budget at risk</span><strong>{b.risk ? (scenario.stakeCents / b.risk * 100).toFixed(1) : '0'}%</strong><div className="progress-track"><i style={{ width: `${Math.min(100, b.risk ? scenario.stakeCents / b.risk * 100 : 0)}%` }}/></div><small>{money(Math.max(0, b.risk - scenario.stakeCents))} virtual balance if the scenario loses</small></div>
        {result && <div className={`outcome-result ${result.won ? 'outcome-win' : ''}`} role="status"><Trophy size={20}/><div><strong>{result.won ? 'A simulated win.' : 'A simulated loss.'} {money(result.netCents)}</strong><p>Recorded in your ledger. Savings unchanged. This does not predict the real game.</p></div></div>}
        <Button variant="outline" className="full-width" onClick={() => void explain()} disabled={asking || !validNumbers}>{asking ? <LoaderCircle size={16} className="spin"/> : <Sparkles size={16}/>}Explain this scenario’s uncertainty</Button>
        {explanation && <div className="inline-explanation" role="status">{explanation}</div>}
      </section>
      <section className="panel guardrails"><div className="panel-heading"><h2>Your guardrails are on</h2><ShieldCheck size={18} className="positive"/></div><div><span>Maximum round-up allocation</span><strong>{state.limits.allocation}%</strong></div><div><span>Scenario exposure limit</span><strong>{state.limits.exposure}% · {money(r.exposure)}</strong></div><div><span>Daily loss capacity left</span><strong>{money(r.remaining)}</strong></div><div><span>Protected savings</span><strong className="positive"><LockKeyhole size={12}/>{money(b.savings)} locked</strong></div><p>Gross daily losses reset at midnight UTC. Protected savings cannot fund simulations.</p></section></div>
    </div>
    <section className="panel sports-history"><div className="panel-heading"><div><h2>Your learning history</h2><p>Virtual outcomes only. Historical demo records are illustrative.</p></div><span className="pill pill-neutral">{state.ledger.filter(entry => entry.kind === 'outcome').length} scenarios</span></div>
      {history.length ? <div className="table-scroll"><table className="transactions-table"><thead><tr><th>Scenario / selected team</th><th>Virtual exposure</th><th>Assumed probability</th><th>Net outcome</th><th>Status</th></tr></thead><tbody>{history.map(entry => <tr key={entry.id}><td><div className="merchant"><Trophy size={17}/><span><strong>{entry.scenario.event}</strong><small>{entry.scenario.legs?.map(leg => leg.team).join(' + ') ?? 'Historical illustrative demo'} · {entry.scenario.combined ? entry.scenario.independent ? 'Independence assumed' : 'Manual combined probability' : 'Single scenario'}</small></span></div></td><td>{money(entry.scenario.stakeCents)}</td><td>{percent(scenarioMetrics(entry.scenario).probability)}</td><td className={entry.netCents >= 0 ? 'positive' : 'amber-text'}>{money(entry.netCents)}</td><td>{entry.won ? 'Virtual win' : 'Virtual loss'}</td></tr>)}</tbody></table></div> : <div className="empty"><h3>Your next what-if starts here.</h3><p>Completed simulations appear here.</p></div>}
    </section>
  </>;
}
