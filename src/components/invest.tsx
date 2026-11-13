"use client";
import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BadgeDollarSign, Check, ChevronRight, CircleHelp, Landmark, LineChart, LoaderCircle, LockKeyhole, Minus, PiggyBank, Plus, RefreshCw, Repeat, Rocket, ShieldCheck, Sparkles, Trash2, TrendingUp, Wallet, X, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Empty, Metric, PageHeading, PanelTitle, Pill, signedMoney, signedPercent } from './ui/kit';
import { GrowthChart } from './charts';
import { useMarkets } from './market-provider';
import { balances, buy, holdings, marketValueCents, money, parseAmount, portfolioValue, projection, runAutoInvest, sell, updateAutoInvest, type AutoInvest, type Portfolio, type Trade } from '@/lib/engine';
import { MARKETS, RETURN_ASSUMPTIONS, STRATEGIES, growthProjection, marketInfo, type Quote } from '@/lib/markets';

type Mutate = (fn: (s: Portfolio) => Portfolio) => Promise<void>;
type Notify = (message: string) => void;
type TradeIntent = { side: 'buy' | 'sell'; symbol: string };
const SLICE_COLORS = ['#f2c14e', '#6d8dff', '#34d399', '#c084fc', '#fb7185', '#38bdf8', '#fbbf24', '#a3e635'];
const prettyDate = (at: string) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const priceText = (price: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
const sharesText = (shares: number) => shares >= 1 ? shares.toFixed(4) : shares.toPrecision(3);

export function Sparkline({ values, up, width = 120, height = 36 }: { values: number[]; up: boolean; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1) * width).toFixed(1)},${(height - 3 - (v - min) / range * (height - 6)).toFixed(1)}`);
  const color = up ? 'var(--gain)' : 'var(--loss)', gradient = `spark-${up ? 'up' : 'down'}`;
  return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill={`url(#${gradient})`} />
    <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
  </svg>;
}
function Change({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="change-chip">—</span>;
  return <span className={`change-chip ${value >= 0 ? 'up' : 'down'}`}>{value >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{signedPercent(value)}{label && <small>{label}</small>}</span>;
}
function Ticker({ symbol, size = 'md' }: { symbol: string; size?: 'md' | 'lg' }) {
  const kind = marketInfo(symbol)?.kind ?? 'stock';
  return <span className={`ticker ticker-${kind} ticker-${size}`}>{symbol.replace('-', '.')}</span>;
}

export function Invest({ state, mutate, notify }: { state: Portfolio; mutate: Mutate; notify: Notify }) {
  const { quotes, prices, status, error, fetchedAt, source, refresh } = useMarkets();
  const [tab, setTab] = useState<'index' | 'stock'>('index'), [trade, setTrade] = useState<TradeIntent | null>(null), [autoOpen, setAutoOpen] = useState(false), [refreshing, setRefreshing] = useState(false);
  const b = balances(state), list = holdings(state), pv = portfolioValue(state, prices), rule = state.autoInvest;
  const trades = state.ledger.filter((e): e is Trade => e.kind === 'trade').slice().reverse();
  const quoteOf = (symbol: string) => quotes.find(q => q.symbol === symbol);
  const rows = list.map(h => { const q = quoteOf(h.symbol), value = q ? marketValueCents(h, q.price) : h.costCents; return { ...h, quote: q, value, gain: value - h.costCents }; });
  const totalValue = rows.reduce((n, r) => n + r.value, 0);
  const ready = status === 'ready';

  async function runNow() {
    let invested = 0;
    try {
      await mutate(s => { const result = runAutoInvest(s, prices, undefined, true); invested = result.investedCents; return result.state; });
      notify(invested ? `Auto-invest put ${money(invested)} to work across ${rule.mix.length} holding${rule.mix.length > 1 ? 's' : ''}.` : `Nothing invested: you need at least ${money(rule.thresholdCents)} of cash in savings (you have ${money(b.savings)}).`);
    } catch (e) { notify((e as Error).message); }
  }

  return <>
    <PageHeading eyebrow="PUT YOUR SAVINGS TO WORK" title="Invest like a wolf. Sleep like a lamb." description="Simulated fractional investing in the S&P 500, index funds and top stocks — funded by your protected savings, priced with live market data.">
      <Button variant="outline" onClick={() => setAutoOpen(true)}><Repeat size={15} />Auto-invest</Button>
      <Button onClick={() => setTrade({ side: 'buy', symbol: 'SPY' })} disabled={!ready}><Plus size={17} />Invest now</Button>
    </PageHeading>

    <div className={`market-status ${status}`}>
      <span className="live-dot" />
      {status === 'loading' && <span>Loading live market prices…</span>}
      {status === 'error' && <span>{error}</span>}
      {status === 'ready' && <span><strong>Live prices</strong> · updated {fetchedAt ? new Date(fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''} · {source}</span>}
      <button className="text-link" onClick={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} disabled={refreshing}><RefreshCw size={13} className={refreshing ? 'spin' : ''} />Refresh</button>
    </div>

    <div className="stats-grid">
      <Metric title="Portfolio value" value={money(pv.valueCents)} icon={LineChart} tone="gold" detail={<><span className="gold-text">{list.length} holding{list.length === 1 ? '' : 's'}</span><span>{money(pv.costCents)} invested</span></>} />
      <Metric title="Total return" value={signedMoney(pv.gainCents, money)} icon={pv.gainCents >= 0 ? TrendingUp : ArrowDownRight} tone={pv.gainCents >= 0 ? 'green' : 'red'} detail={<><Change value={pv.costCents ? pv.gainPercent : 0} /><span>{b.realized ? `${signedMoney(b.realized, money)} realized` : 'unrealized gain'}</span></>} />
      <Metric title="Cash ready to invest" value={money(b.savings)} icon={PiggyBank} tone="blue" detail={<><span className="blue-text">Protected savings</span><span>from your round-ups</span></>} />
      <Metric title="Auto-invest" value={rule.enabled ? 'On' : 'Off'} icon={Repeat} tone="purple" detail={<><span className="purple-text">{rule.percent}% at {money(rule.thresholdCents)}</span><span>{rule.mix.map(m => m.symbol).join(' · ')}</span></>} />
    </div>

    <div className="invest-grid">
      <section className="panel holdings-panel">
        <PanelTitle title="Your holdings" subtitle="Fractional shares, valued at live prices." action={<Pill tone="gold">{money(totalValue)}</Pill>} />
        {rows.length ? <>
          <div className="alloc-bar" role="img" aria-label="Portfolio allocation by holding">{rows.map((r, i) => <i key={r.symbol} style={{ width: `${totalValue ? r.value / totalValue * 100 : 0}%`, background: SLICE_COLORS[i % SLICE_COLORS.length] }} title={`${r.symbol} ${(totalValue ? r.value / totalValue * 100 : 0).toFixed(1)}%`} />)}</div>
          <div className="alloc-legend">{rows.map((r, i) => <span key={r.symbol}><i style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />{r.symbol} <b>{(totalValue ? r.value / totalValue * 100 : 0).toFixed(0)}%</b></span>)}</div>
          <div className="table-scroll"><table className="holdings-table">
            <thead><tr><th>Holding</th><th>Shares</th><th>Avg cost</th><th>Price</th><th>Value</th><th>Return</th><th /></tr></thead>
            <tbody>{rows.map(r => <tr key={r.symbol}>
              <td><div className="holding-name"><Ticker symbol={r.symbol} /><span><strong>{r.name}</strong><small>{marketInfo(r.symbol)?.kind === 'index' ? 'Index fund' : 'Stock'}</small></span></div></td>
              <td className="amount-cell">{sharesText(r.shares)}</td>
              <td className="amount-cell">{priceText(r.costCents / 100 / r.shares)}</td>
              <td className="amount-cell">{r.quote ? priceText(r.quote.price) : '—'}</td>
              <td className="amount-cell"><strong>{money(r.value)}</strong></td>
              <td className={`amount-cell ${r.gain >= 0 ? 'gain-text' : 'loss-text'}`}>{signedMoney(r.gain, money)}<small>{signedPercent(r.costCents ? r.gain / r.costCents * 100 : 0, 1)}</small></td>
              <td><div className="row-actions"><Button size="sm" variant="outline" disabled={!r.quote} onClick={() => setTrade({ side: 'buy', symbol: r.symbol })}><Plus size={13} />Buy</Button><Button size="sm" variant="ghost" disabled={!r.quote} onClick={() => setTrade({ side: 'sell', symbol: r.symbol })}><Minus size={13} />Sell</Button></div></td>
            </tr>)}</tbody>
          </table></div>
        </> : <Empty icon={Landmark} title="No investments yet" description="Pick a fund below or switch on auto-invest to put your saved round-ups to work." />}
      </section>

      <section className="panel auto-panel">
        <PanelTitle title="Auto-invest" subtitle="Your savings, on autopilot." action={<button className={`switch ${rule.enabled ? 'on' : ''}`} role="switch" aria-checked={rule.enabled} aria-label="Toggle auto-invest" onClick={async () => { try { await mutate(s => updateAutoInvest(s, { ...s.autoInvest, enabled: !s.autoInvest.enabled })); notify(rule.enabled ? 'Auto-invest paused. Your savings stay as cash.' : 'Auto-invest is on. New round-ups will be swept into your mix.'); } catch (e) { notify((e as Error).message); } }}><i /></button>} />
        <div className="auto-rule"><Zap size={17} /><p>When your savings cash reaches <strong>{money(rule.thresholdCents)}</strong>, invest <strong>{rule.percent}%</strong> of it automatically.</p></div>
        <div className="mix-list">{rule.mix.map((m, i) => { const q = quoteOf(m.symbol); return <div key={m.symbol} className="mix-item"><div className="mix-top"><span><Ticker symbol={m.symbol} />{m.name}</span><strong>{m.weight}%</strong></div><div className="mix-track"><i style={{ width: `${m.weight}%`, background: SLICE_COLORS[i % SLICE_COLORS.length] }} /></div>{q && <small>{priceText(q.price)} · <Change value={q.changePercent} label="today" /></small>}</div>; })}</div>
        <div className="auto-progress"><div><span>Cash toward next sweep</span><strong>{money(Math.min(b.savings, rule.thresholdCents))} / {money(rule.thresholdCents)}</strong></div><div className="progress-track"><i style={{ width: `${Math.min(100, b.savings / rule.thresholdCents * 100)}%` }} /></div></div>
        <div className="auto-actions"><Button variant="outline" onClick={() => setAutoOpen(true)}><Sparkles size={15} />Edit strategy</Button><Button onClick={runNow} disabled={!ready}><Rocket size={15} />Run now</Button></div>
        <p className="field-hint"><LockKeyhole size={13} />Runs after each new purchase. Only protected savings are invested — never the sports budget.</p>
      </section>
    </div>

    <section className="panel markets-panel">
      <PanelTitle title="Markets" subtitle="Live prices for popular index funds and stocks." action={<div className="range-switch">{([['index', 'Index funds'], ['stock', 'Stocks']] as const).map(([key, label]) => <button key={key} className={tab === key ? 'selected' : ''} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>} />
      {status === 'loading' && !quotes.length ? <div className="market-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="market-card skeleton" />)}</div>
        : !quotes.length ? <Empty icon={LineChart} title="Prices unavailable" description="Live market data couldn't be loaded. Trading is paused until prices return." />
        : <div className="market-grid">{quotes.filter(q => q.kind === tab).map(q => <MarketCard key={q.symbol} quote={q} owned={list.some(h => h.symbol === q.symbol)} onBuy={() => setTrade({ side: 'buy', symbol: q.symbol })} onSell={() => setTrade({ side: 'sell', symbol: q.symbol })} />)}</div>}
    </section>

    <div className="invest-grid invest-grid-even">
      <GrowthCalculator startCents={pv.valueCents + b.savings} monthlyHint={projection(state).monthly} />
      <section className="panel trades-panel">
        <PanelTitle title="Trade history" subtitle="Every simulated buy and sell." action={<Pill tone="neutral">{trades.length} trades</Pill>} />
        {trades.length ? <div className="trade-list">{trades.slice(0, 8).map(t => <div key={t.id} className="trade-row">
          <span className={`trade-icon ${t.side}`}>{t.side === 'buy' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}</span>
          <span className="trade-main"><strong>{t.side === 'buy' ? 'Bought' : 'Sold'} {t.symbol.replace('-', '.')}{t.auto && <Pill tone="purple"><Repeat size={10} />Auto</Pill>}</strong><small>{prettyDate(t.at)} · {sharesText(t.shares)} sh @ {priceText(t.price)}</small></span>
          <strong className={t.side === 'buy' ? '' : 'gain-text'}>{t.side === 'buy' ? '−' : '+'}{money(t.amountCents)}</strong>
        </div>)}</div> : <Empty icon={BadgeDollarSign} title="No trades yet" description="Your buys and sells will show up here." />}
      </section>
    </div>

    <section className="risk-strip invest-disclaimer"><div className="risk-strip-icon"><ShieldCheck size={21} /></div><div><strong>Real prices. Simulated money.</strong><p>Quotes come from public market data and may be delayed. No real orders are placed and no brokerage is connected. Past performance doesn’t guarantee future results.</p></div><Pill tone="gold"><span className="tiny-dot" />Educational</Pill></section>

    <Dialog open={trade !== null} onOpenChange={open => !open && setTrade(null)}><DialogContent>{trade && <TradeForm key={`${trade.side}-${trade.symbol}`} intent={trade} state={state} quotes={quotes} mutate={mutate} notify={notify} onClose={() => setTrade(null)} />}</DialogContent></Dialog>
    <Dialog open={autoOpen} onOpenChange={setAutoOpen}><DialogContent className="dialog-wide">{autoOpen && <AutoInvestForm state={state} prices={prices} mutate={mutate} notify={notify} onClose={() => setAutoOpen(false)} />}</DialogContent></Dialog>
  </>;
}

function MarketCard({ quote: q, owned, onBuy, onSell }: { quote: Quote; owned: boolean; onBuy: () => void; onSell: () => void }) {
  const trendUp = q.history.at(-1)! >= q.history[0];
  return <article className="market-card">
    <div className="market-card-top"><Ticker symbol={q.symbol} size="lg" /><div><strong>{q.name}</strong><small>{q.blurb}</small></div>{owned && <Pill tone="gold">Owned</Pill>}</div>
    <div className="market-card-price"><strong>{priceText(q.price)}</strong><Change value={q.changePercent} label="today" /></div>
    <Sparkline values={q.history} up={trendUp} width={240} height={44} />
    <div className="market-card-bottom"><span>1 year <Change value={q.yearChangePercent} /></span><div><Button size="sm" onClick={onBuy}><Plus size={13} />Buy</Button>{owned && <Button size="sm" variant="outline" onClick={onSell}>Sell</Button>}</div></div>
  </article>;
}

function TradeForm({ intent, state, quotes, mutate, notify, onClose }: { intent: TradeIntent; state: Portfolio; quotes: Quote[]; mutate: Mutate; notify: Notify; onClose: () => void }) {
  const [side, setSide] = useState(intent.side), [symbol, setSymbol] = useState(intent.symbol), [amount, setAmount] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const b = balances(state), quote = quotes.find(q => q.symbol === symbol), position = holdings(state).find(h => h.symbol === symbol);
  const owned = position && quote ? marketValueCents(position, quote.price) : 0, max = side === 'buy' ? b.savings : owned;
  let cents = 0; try { cents = parseAmount(amount); } catch { /* shown below */ }
  const shares = quote && cents ? cents / 100 / quote.price : 0;
  const symbols = side === 'buy' ? quotes : quotes.filter(q => holdings(state).some(h => h.symbol === q.symbol));
  const quick = side === 'buy' ? [100, 500, 1000].filter(v => v <= max) : [];
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || !quote) return; setBusy(true); setError('');
    try {
      const sellAll = side === 'sell' && cents >= owned;
      await mutate(s => side === 'buy' ? buy(s, { symbol, name: quote.name, price: quote.price, amountCents: cents }) : sell(s, { symbol, price: quote.price, amountCents: cents, all: sellAll }));
      notify(side === 'buy' ? `Bought ${sharesText(shares)} shares of ${symbol} for ${money(cents)}.` : `Sold ${money(Math.min(cents, owned))} of ${symbol}. Proceeds returned to protected savings.`);
      onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <form onSubmit={submit}>
    <div className="dialog-eyebrow"><BadgeDollarSign size={17} /> {side === 'buy' ? 'BUY FRACTIONAL SHARES' : 'SELL TO SAVINGS'}</div>
    <DialogTitle>{side === 'buy' ? 'Put your savings to work.' : 'Take some chips off the table.'}</DialogTitle>
    <DialogDescription>{side === 'buy' ? 'Invest any amount — even a few cents — at the live price.' : 'Proceeds go straight back into your protected savings.'}</DialogDescription>
    <div className="form-stack">
      <div className="segmented">{(['buy', 'sell'] as const).map(value => <button type="button" key={value} className={side === value ? 'selected' : ''} disabled={value === 'sell' && !holdings(state).length} onClick={() => { setSide(value); if (value === 'sell' && !holdings(state).some(h => h.symbol === symbol)) setSymbol(holdings(state)[0]?.symbol ?? symbol); }}>{value === 'buy' ? 'Buy' : 'Sell'}</button>)}</div>
      <label>Investment<select value={symbol} onChange={e => setSymbol(e.target.value)}>{symbols.map(q => <option key={q.symbol} value={q.symbol}>{q.symbol.replace('-', '.')} — {q.name}</option>)}</select></label>
      {quote && <div className="trade-quote"><div><Ticker symbol={quote.symbol} size="lg" /><span><strong>{priceText(quote.price)}</strong><small>per share · live</small></span></div><Change value={quote.changePercent} label="today" /></div>}
      <label>Amount<div className="money-input"><span>$</span><input aria-label="Trade amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} autoFocus /></div></label>
      <div className="quick-amounts">{quick.map(v => <button type="button" key={v} onClick={() => setAmount((v / 100).toFixed(2))}>{money(v)}</button>)}{max > 0 && <button type="button" onClick={() => setAmount((Math.floor(max / 2) / 100).toFixed(2))}>Half</button>}{max > 0 && <button type="button" onClick={() => setAmount((max / 100).toFixed(2))}>{side === 'buy' ? 'All cash' : 'Sell all'}</button>}</div>
      <div className="trade-summary">
        <div><span>{side === 'buy' ? 'Cash available' : 'Position value'}</span><strong>{money(max)}</strong></div>
        <div><span>Estimated shares</span><strong>{shares ? sharesText(shares) : '—'}</strong></div>
        <div><span>{side === 'buy' ? 'Cash after' : 'Savings after'}</span><strong>{money(side === 'buy' ? Math.max(0, b.savings - cents) : b.savings + Math.min(cents, owned))}</strong></div>
      </div>
      {cents > max && <div className="alert alert-error" role="alert">{side === 'buy' ? `Only ${money(max)} of protected savings is available.` : `Your position is worth ${money(max)}.`}</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <Button type="submit" className="full-width" disabled={busy || !quote || !cents || (side === 'buy' && cents > max)}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{side === 'buy' ? `Buy ${symbol.replace('-', '.')}` : `Sell ${symbol.replace('-', '.')}`}</Button>
      <p className="field-hint"><CircleHelp size={13} />Simulated order at the latest quoted price. No real money moves.</p>
    </div>
  </form>;
}

function AutoInvestForm({ state, prices, mutate, notify, onClose }: { state: Portfolio; prices: Record<string, number>; mutate: Mutate; notify: Notify; onClose: () => void }) {
  const [rule, setRule] = useState<AutoInvest>(state.autoInvest), [threshold, setThreshold] = useState((state.autoInvest.thresholdCents / 100).toFixed(2)), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const total = rule.mix.reduce((n, m) => n + m.weight, 0);
  const named = (symbol: string) => marketInfo(symbol)?.name ?? symbol;
  const applyStrategy = (mix: readonly { symbol: string; weight: number }[]) => setRule(r => ({ ...r, mix: mix.map(m => ({ ...m, name: named(m.symbol) })) }));
  const activeStrategy = STRATEGIES.find(s => s.mix.length === rule.mix.length && s.mix.every(m => rule.mix.some(r => r.symbol === m.symbol && r.weight === m.weight)))?.key;
  async function save(runAfter: boolean) {
    setError(''); setBusy(true);
    try {
      const thresholdCents = parseAmount(threshold);
      let invested = 0;
      await mutate(s => { const next = updateAutoInvest(s, { ...rule, thresholdCents }); if (!runAfter) return next; const result = runAutoInvest(next, prices, undefined, true); invested = result.investedCents; return result.state; });
      notify(runAfter ? (invested ? `Strategy saved and ${money(invested)} invested.` : 'Strategy saved. Not enough cash yet to run a sweep.') : `Auto-invest ${rule.enabled ? 'is on' : 'saved (paused)'}.`);
      onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <div>
    <div className="dialog-eyebrow"><Repeat size={17} /> AUTO-INVEST STRATEGY</div>
    <DialogTitle>Set it, and let your change compound.</DialogTitle>
    <DialogDescription>Choose a ready-made pack or build your own mix of funds and stocks.</DialogDescription>
    <div className="form-stack">
      <div className="strategy-grid">{STRATEGIES.map(s => <button type="button" key={s.key} className={`strategy-card ${activeStrategy === s.key ? 'selected' : ''}`} onClick={() => applyStrategy(s.mix)}><strong>{s.name}</strong><small>{s.description}</small><span>{s.mix.map(m => `${m.symbol} ${m.weight}%`).join(' · ')}</span></button>)}</div>
      <div className="mix-editor">
        <div className="mix-editor-head"><strong>Your mix</strong><span className={total === 100 ? 'gain-text' : 'loss-text'}>{total}% of 100%</span></div>
        {rule.mix.map((m, i) => <div className="mix-row" key={i}>
          <select aria-label={`Holding ${i + 1}`} value={m.symbol} onChange={e => setRule(r => ({ ...r, mix: r.mix.map((x, j) => j === i ? { ...x, symbol: e.target.value, name: named(e.target.value) } : x) }))}>{MARKETS.map(info => <option key={info.symbol} value={info.symbol} disabled={info.symbol !== m.symbol && rule.mix.some(x => x.symbol === info.symbol)}>{info.symbol.replace('-', '.')} — {info.name}</option>)}</select>
          <div className="percent-input"><input aria-label={`Weight for ${m.symbol}`} type="number" min={1} max={100} value={m.weight} onChange={e => setRule(r => ({ ...r, mix: r.mix.map((x, j) => j === i ? { ...x, weight: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) } : x) }))} /><span>%</span></div>
          <button type="button" className="icon-button" aria-label={`Remove ${m.symbol}`} disabled={rule.mix.length === 1} onClick={() => setRule(r => ({ ...r, mix: r.mix.filter((_, j) => j !== i) }))}><Trash2 size={15} /></button>
        </div>)}
        {rule.mix.length < 6 && <button type="button" className="text-link" onClick={() => { const next = MARKETS.find(info => !rule.mix.some(m => m.symbol === info.symbol)); if (next) setRule(r => ({ ...r, mix: [...r.mix, { symbol: next.symbol, name: next.name, weight: Math.max(1, 100 - total) }] })); }}><Plus size={14} />Add a fund or stock</button>}
      </div>
      <div className="form-grid">
        <label>Invest when cash reaches<div className="money-input"><span>$</span><input inputMode="decimal" value={threshold} onChange={e => setThreshold(e.target.value)} aria-label="Auto-invest threshold" /></div></label>
        <label>Share of cash to invest<div className="percent-slider"><input type="range" min={10} max={100} step={10} value={rule.percent} onChange={e => setRule(r => ({ ...r, percent: Number(e.target.value) }))} aria-label="Share of cash to invest" style={{ '--range-fill': `${(rule.percent - 10) / 90 * 100}%` } as React.CSSProperties} /><strong>{rule.percent}%</strong></div></label>
      </div>
      <label className="checkbox-label"><input type="checkbox" checked={rule.enabled} onChange={e => setRule(r => ({ ...r, enabled: e.target.checked }))} />Run automatically after each new purchase</label>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="dialog-actions"><Button type="button" variant="outline" disabled={busy || total !== 100} onClick={() => save(true)}><Rocket size={15} />Save & run now</Button><Button type="button" disabled={busy || total !== 100} onClick={() => save(false)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Save strategy</Button></div>
      <button type="button" className="dialog-close-link" onClick={onClose}><X size={13} />Cancel</button>
    </div>
  </div>;
}

function GrowthCalculator({ startCents, monthlyHint }: { startCents: number; monthlyHint: number }) {
  const [monthly, setMonthly] = useState(Math.max(25, Math.round(monthlyHint / 100 / 5) * 5)), [years, setYears] = useState(20), [assumption, setAssumption] = useState<(typeof RETURN_ASSUMPTIONS)[number]['key']>('sp500');
  const rate = RETURN_ASSUMPTIONS.find(a => a.key === assumption)!;
  const data = useMemo(() => growthProjection(startCents, monthly * 100, years, rate.rate), [startCents, monthly, years, rate.rate]);
  const last = data.at(-1)!;
  return <section className="panel growth-panel">
    <PanelTitle title="What could it become?" subtitle="Compound growth, illustrated." action={<Wallet size={17} className="muted" />} />
    <div className="growth-figures"><div><span>Projected value</span><strong className="gold-text">{money(Math.round(last.value * 100))}</strong></div><div><span>You contribute</span><strong>{money(Math.round(last.contributed * 100))}</strong></div><div><span>Growth</span><strong className="gain-text">{money(Math.round((last.value - last.contributed) * 100))}</strong></div></div>
    <GrowthChart data={data} />
    <div className="growth-controls">
      <label><span>Monthly <strong>{money(monthly * 100)}</strong></span><input type="range" min={0} max={1000} step={5} value={monthly} onChange={e => setMonthly(Number(e.target.value))} style={{ '--range-fill': `${monthly / 10}%` } as React.CSSProperties} /></label>
      <label><span>Years <strong>{years}</strong></span><input type="range" min={1} max={40} value={years} onChange={e => setYears(Number(e.target.value))} style={{ '--range-fill': `${(years - 1) / 39 * 100}%` } as React.CSSProperties} /></label>
    </div>
    <div className="segmented">{RETURN_ASSUMPTIONS.map(a => <button type="button" key={a.key} className={assumption === a.key ? 'selected' : ''} onClick={() => setAssumption(a.key)}>{a.label} · {(a.rate * 100).toFixed(0)}%</button>)}</div>
    <div className="mini-note"><CircleHelp size={13} /><span>{rate.note}. Starts from your current savings and investments ({money(startCents)}). Returns vary year to year and can be negative — this is an illustration, not a forecast.</span></div>
    <a className="text-link" href="/advisor"><Sparkles size={14} />Ask Wolf Intelligence about investing<ChevronRight size={14} /></a>
  </section>;
}
