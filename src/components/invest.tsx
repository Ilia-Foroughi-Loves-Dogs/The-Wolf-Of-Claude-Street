"use client";
import { useMemo, useState } from 'react';
import { Check, LineChart, LoaderCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Card, Empty, PageTitle, signedMoney, signedPercent } from './ui/kit';
import { GrowthChart } from './charts';
import { useMarkets } from './market-provider';
import { balances, buy, holdings, marketValueCents, money, parseAmount, portfolioValue, runAutoInvest, sell, updateAutoInvest, type AutoInvest, type Portfolio } from '@/lib/engine';
import { MARKETS, RETURN_ASSUMPTIONS, STRATEGIES, growthProjection, marketInfo, type Quote } from '@/lib/markets';

type Mutate = (fn: (s: Portfolio) => Portfolio) => Promise<void>;
type Notify = (message: string) => void;
type TradeIntent = { side: 'buy' | 'sell'; symbol: string };
const priceText = (price: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
const sharesText = (shares: number) => shares >= 1 ? shares.toFixed(3) : shares.toPrecision(2);
const tickerText = (symbol: string) => symbol.replace('-', '.');

export function Sparkline({ values, width = 90, height = 30 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1) * width).toFixed(1)},${(height - 2 - (v - min) / range * (height - 4)).toFixed(1)}`).join(' ');
  return <svg className={`spark ${values.at(-1)! >= values[0] ? 'up' : 'down'}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="change">—</span>;
  return <span className={`change ${value >= 0 ? 'up' : 'down'}`}>{signedPercent(value)}</span>;
}
function Ticker({ symbol }: { symbol: string }) { return <span className={`ticker ticker-${marketInfo(symbol)?.kind ?? 'stock'}`}>{tickerText(symbol)}</span>; }

export function Invest({ state, mutate, notify }: { state: Portfolio; mutate: Mutate; notify: Notify }) {
  const { quotes, prices, status, error, fetchedAt, refresh } = useMarkets();
  const [tab, setTab] = useState<'index' | 'stock'>('index'), [trade, setTrade] = useState<TradeIntent | null>(null), [autoOpen, setAutoOpen] = useState(false);
  const b = balances(state), owned = holdings(state), pv = portfolioValue(state, prices), rule = state.autoInvest, ready = status === 'ready';
  const quoteOf = (symbol: string) => quotes.find(q => q.symbol === symbol);

  async function toggleAuto() {
    try { await mutate(s => updateAutoInvest(s, { ...s.autoInvest, enabled: !s.autoInvest.enabled })); notify(rule.enabled ? 'Auto-invest is off.' : 'Auto-invest is on.'); }
    catch (e) { notify((e as Error).message); }
  }

  return <>
    <PageTitle title="Invest" subtitle="Use your savings to buy pieces of funds and stocks. Prices are real; the money is pretend." />

    <section className="card invest-summary">
      <div><span className="label">Your investments</span><strong className="hero-amount">{money(pv.valueCents)}</strong>
        {pv.costCents > 0 && pv.priced ? <span className={`hero-change ${pv.gainCents >= 0 ? 'up' : 'down'}`}>{signedMoney(pv.gainCents, money)} ({signedPercent(pv.gainPercent, 1)}) all time</span> : <span className="muted">{pv.costCents > 0 ? 'Loading today’s prices…' : 'You haven’t invested yet.'}</span>}</div>
      <div className="invest-cash"><span className="label">Savings ready to invest</span><strong>{money(b.savings)}</strong><Button onClick={() => setTrade({ side: 'buy', symbol: 'SPY' })} disabled={!ready || b.savings < 1}><Plus size={16} />Invest</Button></div>
    </section>
    {status !== 'ready' && <div className={`notice ${status === 'error' ? 'notice-error' : ''}`}>{status === 'loading' ? 'Loading live prices…' : error}{status === 'error' && <button type="button" className="link-btn" onClick={refresh}>Try again</button>}</div>}

    <div className="grid-2">
      <Card title="What you own">
        {owned.length ? <ul className="rows">{owned.map(h => {
          const q = quoteOf(h.symbol), value = q ? marketValueCents(h, q.price) : h.costCents, gain = value - h.costCents;
          return <li key={h.symbol} className="row">
            <Ticker symbol={h.symbol} />
            <span className="row-main"><strong>{h.name}</strong><small>{sharesText(h.shares)} shares</small></span>
            <span className="row-end"><strong>{money(value)}</strong><small className={gain >= 0 ? 'up' : 'down'}>{signedMoney(gain, money)}</small></span>
            <span className="row-buttons"><Button size="sm" variant="outline" disabled={!q} onClick={() => setTrade({ side: 'buy', symbol: h.symbol })}>Buy</Button><Button size="sm" variant="ghost" disabled={!q} onClick={() => setTrade({ side: 'sell', symbol: h.symbol })}>Sell</Button></span>
          </li>;
        })}</ul> : <Empty icon={LineChart} title="Nothing yet" description="Pick something from the list below to make your first investment. The S&P 500 is a popular place to start." />}
      </Card>

      <Card title="Auto-invest" action={<button className={`switch ${rule.enabled ? 'on' : ''}`} role="switch" aria-checked={rule.enabled} aria-label="Auto-invest" onClick={toggleAuto}><i /></button>}>
        <p className="auto-text">{rule.enabled ? <>When your savings reach <strong>{money(rule.thresholdCents)}</strong>, we’ll invest <strong>{rule.percent}%</strong> of it for you.</> : 'Off. Turn it on and we’ll invest your savings for you whenever they build up.'}</p>
        <ul className="mix">{rule.mix.map(m => <li key={m.symbol}><span>{m.name}</span><span className="mix-bar"><i style={{ width: `${m.weight}%` }} /></span><strong>{m.weight}%</strong></li>)}</ul>
        <Button variant="outline" className="full-width" onClick={() => setAutoOpen(true)}>Change plan</Button>
      </Card>
    </div>

    <Card title="Browse" action={<div className="segmented segmented-sm">{([['index', 'Funds'], ['stock', 'Stocks']] as const).map(([key, label]) => <button key={key} type="button" className={tab === key ? 'selected' : ''} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>}>
      <p className="muted card-intro">{tab === 'index' ? 'Funds hold many companies at once, so they’re usually steadier than single stocks.' : 'Single companies. They can rise or fall faster than funds.'}</p>
      {!quotes.length ? <Empty icon={LineChart} title={status === 'loading' ? 'Loading prices…' : 'Prices unavailable'} description={status === 'loading' ? 'One moment.' : 'Live prices couldn’t be loaded. Try again shortly.'} />
        : <ul className="rows">{quotes.filter(q => q.kind === tab).map(q => <MarketRow key={q.symbol} quote={q} onBuy={() => setTrade({ side: 'buy', symbol: q.symbol })} />)}</ul>}
      {fetchedAt && <p className="footnote card-foot"><RefreshCw size={12} />Prices updated {new Date(fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. They may be delayed a few minutes.</p>}
    </Card>

    <GrowthCalculator startCents={pv.valueCents + b.savings} />

    <Dialog open={trade !== null} onOpenChange={open => !open && setTrade(null)}><DialogContent>{trade && <TradeForm key={`${trade.side}-${trade.symbol}`} intent={trade} state={state} quotes={quotes} mutate={mutate} notify={notify} onClose={() => setTrade(null)} />}</DialogContent></Dialog>
    <Dialog open={autoOpen} onOpenChange={setAutoOpen}><DialogContent>{autoOpen && <AutoInvestForm state={state} prices={prices} mutate={mutate} notify={notify} onClose={() => setAutoOpen(false)} />}</DialogContent></Dialog>
  </>;
}

function MarketRow({ quote: q, onBuy }: { quote: Quote; onBuy: () => void }) {
  return <li className="row market-row">
    <Ticker symbol={q.symbol} />
    <span className="row-main"><strong>{q.name}</strong><small>{q.blurb}</small></span>
    <Sparkline values={q.history} />
    <span className="row-end"><strong>{priceText(q.price)}</strong><small>Today <Change value={q.changePercent} /></small></span>
    <Button size="sm" onClick={onBuy}>Buy</Button>
  </li>;
}

function TradeForm({ intent, state, quotes, mutate, notify, onClose }: { intent: TradeIntent; state: Portfolio; quotes: Quote[]; mutate: Mutate; notify: Notify; onClose: () => void }) {
  const [symbol, setSymbol] = useState(intent.symbol), [amount, setAmount] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const side = intent.side, b = balances(state), quote = quotes.find(q => q.symbol === symbol), position = holdings(state).find(h => h.symbol === symbol);
  const owned = position && quote ? marketValueCents(position, quote.price) : 0, max = side === 'buy' ? b.savings : owned;
  let cents = 0; try { cents = parseAmount(amount); } catch { cents = 0; }
  const choices = side === 'buy' ? quotes : quotes.filter(q => holdings(state).some(h => h.symbol === q.symbol));
  const tooMuch = cents > max;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || !quote || tooMuch) return; setBusy(true); setError('');
    try {
      await mutate(s => side === 'buy' ? buy(s, { symbol, name: quote.name, price: quote.price, amountCents: cents }) : sell(s, { symbol, price: quote.price, amountCents: cents, all: cents >= owned }));
      notify(side === 'buy' ? `You invested ${money(cents)} in ${quote.name}.` : `You sold ${money(Math.min(cents, owned))} of ${quote.name}. The money is back in your savings.`);
      onClose();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return <form onSubmit={submit}>
    <DialogTitle>{side === 'buy' ? 'Invest' : 'Sell'}</DialogTitle>
    <DialogDescription>{side === 'buy' ? 'Choose an amount. Any amount works — even a few dollars.' : 'The money goes back into your savings.'}</DialogDescription>
    <div className="stack">
      <label className="field">{side === 'buy' ? 'Invest in' : 'Sell'}<select value={symbol} onChange={e => { setSymbol(e.target.value); setAmount(''); }}>{choices.map(q => <option key={q.symbol} value={q.symbol}>{q.name} ({tickerText(q.symbol)})</option>)}</select></label>
      {quote && <p className="muted small">1 share costs {priceText(quote.price)} right now (<Change value={quote.changePercent} /> today). You’ll get a piece of a share.</p>}
      <label className="field">Amount<span className="money-field money-field-lg"><span>$</span><input aria-label="Amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} autoFocus /></span></label>
      <div className="chips">{(side === 'buy' ? [100, 500, 1000] : []).filter(v => v <= max).map(v => <button type="button" key={v} className="chip" onClick={() => setAmount((v / 100).toFixed(2))}>{money(v)}</button>)}{max > 0 && <button type="button" className="chip" onClick={() => setAmount((max / 100).toFixed(2))}>{side === 'buy' ? `All (${money(max)})` : `Sell all (${money(max)})`}</button>}</div>
      <p className={`muted small ${tooMuch ? 'down' : ''}`}>{tooMuch ? (side === 'buy' ? `You only have ${money(max)} in savings.` : `You only own ${money(max)} of this.`) : side === 'buy' ? `${money(b.savings)} available in savings.` : `You own ${money(owned)} of this.`}</p>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <Button type="submit" className="full-width btn-lg" disabled={busy || !quote || !cents || tooMuch}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{side === 'buy' ? `Invest ${cents ? money(cents) : ''}` : `Sell ${cents ? money(Math.min(cents, owned)) : ''}`}</Button>
    </div>
  </form>;
}

function AutoInvestForm({ state, prices, mutate, notify, onClose }: { state: Portfolio; prices: Record<string, number>; mutate: Mutate; notify: Notify; onClose: () => void }) {
  const [rule, setRule] = useState<AutoInvest>(state.autoInvest), [threshold, setThreshold] = useState((state.autoInvest.thresholdCents / 100).toFixed(2)), [custom, setCustom] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const total = rule.mix.reduce((n, m) => n + m.weight, 0), named = (symbol: string) => marketInfo(symbol)?.name ?? symbol;
  const active = STRATEGIES.find(s => s.mix.length === rule.mix.length && s.mix.every(m => rule.mix.some(r => r.symbol === m.symbol && r.weight === m.weight)))?.key;
  async function save() {
    setError(''); setBusy(true);
    try {
      const thresholdCents = parseAmount(threshold); let invested = 0;
      await mutate(s => { const next = updateAutoInvest(s, { ...rule, thresholdCents, enabled: true }); const result = runAutoInvest(next, prices); invested = result.investedCents; return result.state; });
      notify(invested ? `Plan saved. ${money(invested)} was invested right away.` : 'Plan saved. Auto-invest is on.');
      onClose();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return <div>
    <DialogTitle>Your auto-invest plan</DialogTitle>
    <DialogDescription>Pick a plan. We’ll invest your savings into it automatically.</DialogDescription>
    <div className="stack">
      <div className="plans">{STRATEGIES.map(s => <button type="button" key={s.key} className={`plan ${active === s.key ? 'selected' : ''}`} onClick={() => { setCustom(false); setRule(r => ({ ...r, mix: s.mix.map(m => ({ ...m, name: named(m.symbol) })) })); }}>
        <span className="plan-radio" /><span><strong>{s.name}</strong><small>{s.description}</small><small className="plan-mix">{s.mix.map(m => `${named(m.symbol)} ${m.weight}%`).join(' · ')}</small></span></button>)}
      </div>
      {!custom ? <button type="button" className="link-btn" onClick={() => setCustom(true)}>Or build your own mix</button> : <div className="custom-mix">
        <div className="custom-head"><strong>Your mix</strong><span className={total === 100 ? 'up' : 'down'}>{total}% of 100%</span></div>
        {rule.mix.map((m, i) => <div className="custom-row" key={i}>
          <select aria-label={`Investment ${i + 1}`} value={m.symbol} onChange={e => setRule(r => ({ ...r, mix: r.mix.map((x, j) => j === i ? { ...x, symbol: e.target.value, name: named(e.target.value) } : x) }))}>{MARKETS.map(info => <option key={info.symbol} value={info.symbol} disabled={info.symbol !== m.symbol && rule.mix.some(x => x.symbol === info.symbol)}>{info.name}</option>)}</select>
          <span className="percent-field"><input aria-label={`Percent for ${m.name}`} type="number" min={1} max={100} value={m.weight} onChange={e => setRule(r => ({ ...r, mix: r.mix.map((x, j) => j === i ? { ...x, weight: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) } : x) }))} /><span>%</span></span>
          <button type="button" className="icon-btn" aria-label={`Remove ${m.name}`} disabled={rule.mix.length === 1} onClick={() => setRule(r => ({ ...r, mix: r.mix.filter((_, j) => j !== i) }))}><Trash2 size={15} /></button>
        </div>)}
        {rule.mix.length < 6 && <button type="button" className="link-btn" onClick={() => { const next = MARKETS.find(info => !rule.mix.some(m => m.symbol === info.symbol)); if (next) setRule(r => ({ ...r, mix: [...r.mix, { symbol: next.symbol, name: next.name, weight: Math.max(1, 100 - total) }] })); }}><Plus size={14} />Add another</button>}
      </div>}
      <div className="form-pair">
        <label className="field">Invest when savings reach<span className="money-field"><span>$</span><input inputMode="decimal" value={threshold} onChange={e => setThreshold(e.target.value)} aria-label="Invest when savings reach" /></span></label>
        <label className="field">How much to invest<select value={rule.percent} onChange={e => setRule(r => ({ ...r, percent: Number(e.target.value) }))}>{[25, 50, 75, 100].map(p => <option key={p} value={p}>{p}% of savings</option>)}</select></label>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <Button type="button" className="full-width btn-lg" disabled={busy || total !== 100} onClick={save}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Save and turn on</Button>
    </div>
  </div>;
}

function GrowthCalculator({ startCents }: { startCents: number }) {
  const [monthly, setMonthly] = useState(50), [years, setYears] = useState(20), [assumption, setAssumption] = useState<(typeof RETURN_ASSUMPTIONS)[number]['key']>('sp500');
  const rate = RETURN_ASSUMPTIONS.find(a => a.key === assumption)!;
  const data = useMemo(() => growthProjection(startCents, monthly * 100, years, rate.rate), [startCents, monthly, years, rate.rate]);
  const last = data.at(-1)!;
  return <Card title="What could it grow to?" className="growth">
    <p className="growth-answer">If you add <strong>{money(monthly * 100)}</strong> a month for <strong>{years} years</strong>, you could have about <strong className="big-number">{money(Math.round(last.value * 100))}</strong> <span className="muted">— you’d put in {money(Math.round(last.contributed * 100))}.</span></p>
    <div className="form-pair">
      <label className="field">Each month: {money(monthly * 100)}<input type="range" min={0} max={1000} step={5} value={monthly} onChange={e => setMonthly(Number(e.target.value))} /></label>
      <label className="field">Years: {years}<input type="range" min={1} max={40} value={years} onChange={e => setYears(Number(e.target.value))} /></label>
    </div>
    <div className="segmented">{RETURN_ASSUMPTIONS.map(a => <button type="button" key={a.key} className={assumption === a.key ? 'selected' : ''} aria-pressed={assumption === a.key} onClick={() => setAssumption(a.key)}>{a.label} ({(a.rate * 100).toFixed(0)}%/yr)</button>)}</div>
    <GrowthChart data={data} />
    <p className="footnote">An estimate only. Real returns go up and down, and can be negative some years.</p>
  </Card>;
}
