"use client";
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, CircleHelp, Coffee, Download, Home as HomeIcon, LineChart, LoaderCircle, MessageCircleQuestion, PiggyBank, Plus, Repeat, RotateCcw, Search, Settings as SettingsIcon, ShieldCheck, ShoppingBag, ShoppingCart, Target, Trophy, X, type LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Card, Empty, PageTitle, WolfMark, initials, signedMoney, signedPercent } from './ui/kit';
import { ActivityChart } from './charts';
import { Ask } from './ask';
import { Invest } from './invest';
import { useProfile } from './account-provider';
import { useMarkets } from './market-provider';
import { usePortfolio } from './portfolio-provider';
import { SportsSimulator } from './sports-simulator';
import { addPurchase, balances, demoPortfolio, emptyPortfolio, generateReview, id, money, parseAmount, portfolioValue, purchaseAllocation, runAutoInvest, saveReview, updateAllocation, updateLimits, type LedgerEntry, type Limits, type Portfolio } from '@/lib/engine';

type Notify = (message: string) => void;
type Mutate = (fn: (s: Portfolio) => Portfolio) => Promise<void>;
type NavItem = { key: string; label: string; icon: LucideIcon; path: string; mobile: boolean };
const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Home', icon: HomeIcon, path: '/', mobile: true },
  { key: 'invest', label: 'Invest', icon: LineChart, path: '/invest', mobile: true },
  { key: 'activity', label: 'Activity', icon: ArrowLeftRight, path: '/activity', mobile: true },
  { key: 'simulator', label: 'Sports Lab', icon: Trophy, path: '/simulator', mobile: true },
  { key: 'advisor', label: 'Ask a question', icon: MessageCircleQuestion, path: '/advisor', mobile: false },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, path: '/settings', mobile: true },
];
const CATEGORIES = ['Food & drink', 'Groceries', 'Transport', 'Shopping', 'Other'];
const shortDate = (at: string) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function Application({ view }: { view: string }) {
  const { name } = useProfile();
  const { state, ready, storageError, mutate, activeScenario, setActiveScenario } = usePortfolio();
  const [purchaseOpen, setPurchaseOpen] = useState(false), [helpOpen, setHelpOpen] = useState(false), [reviewOpen, setReviewOpen] = useState(false), [reset, setReset] = useState<'demo' | 'empty' | null>(null), [notice, setNotice] = useState('');
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
  const notify: Notify = message => setNotice(message);
  async function review() { try { await mutate(s => saveReview(s)); setReviewOpen(true); } catch (e) { notify((e as Error).message); } }

  return <div className="app">
    <aside className="side">
      <Link href="/" className="logo"><span className="logo-mark"><WolfMark size={20} /></span>Wolf of Claude Street</Link>
      <nav aria-label="Main">{NAV.map(({ key, label, icon: Icon, path }) => <Link key={key} href={path} className={`side-link ${view === key ? 'active' : ''}`} aria-current={view === key ? 'page' : undefined}><Icon size={19} strokeWidth={1.8} />{label}</Link>)}</nav>
      <button type="button" className="side-link side-help" onClick={() => setHelpOpen(true)}><CircleHelp size={19} strokeWidth={1.8} />How it works</button>
      {name && <Link href="/settings" className="side-user"><span className="avatar">{initials(name)}</span><span className="side-user-text"><strong>{name}</strong><small>Settings</small></span></Link>}
    </aside>

    <header className="mobile-top">
      <Link href="/" className="logo"><span className="logo-mark"><WolfMark size={18} /></span>Wolf of Claude Street</Link>
      <div><Link href="/advisor" className="icon-btn" aria-label="Ask a question"><MessageCircleQuestion size={20} /></Link><Link href="/settings" className="icon-btn" aria-label="Settings"><SettingsIcon size={20} /></Link></div>
    </header>

    <main className="content">
      {storageError && <div className="notice notice-error" role="alert">{storageError}</div>}
      {!ready ? <div className="loading"><LoaderCircle className="spin" size={22} />Loading…</div> : <div className="page" key={view}>
        {view === 'dashboard' && <Home state={state} mutate={mutate} notify={notify} onPurchase={() => setPurchaseOpen(true)} onHelp={() => setHelpOpen(true)} />}
        {view === 'invest' && <Invest state={state} mutate={mutate} notify={notify} />}
        {view === 'activity' && <Activity state={state} onPurchase={() => setPurchaseOpen(true)} />}
        {view === 'simulator' && <SportsSimulator state={state} mutate={mutate} notify={notify} onReview={review} onScenarioChange={setActiveScenario} />}
        {view === 'advisor' && <Ask state={state} scenario={activeScenario} />}
        {view === 'settings' && <Settings state={state} mutate={mutate} notify={notify} onReset={setReset} />}
      </div>}
      <footer className="app-footer">Practice app · Real market prices, pretend money · No bank connected</footer>
    </main>

    <nav className="tabbar" aria-label="Main">{NAV.filter(n => n.mobile).map(({ key, label, icon: Icon, path }) => <Link key={key} href={path} className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined}><Icon size={21} strokeWidth={1.8} /><span>{label === 'Sports Lab' ? 'Sports' : label}</span></Link>)}</nav>

    <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}><DialogContent><PurchaseForm state={state} mutate={mutate} notify={notify} onClose={() => setPurchaseOpen(false)} /></DialogContent></Dialog>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent><HowItWorks onStart={() => { setHelpOpen(false); setPurchaseOpen(true); }} /></DialogContent></Dialog>
    <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent><DialogTitle>Your weekly Sports Lab check-in</DialogTitle><DialogDescription>A summary of the last seven days.</DialogDescription>{state.reviews[0] && <ReviewReport state={state} />}<Button className="full-width" variant="outline" onClick={() => setReviewOpen(false)}>Done</Button></DialogContent></Dialog>
    <Dialog open={reset !== null} onOpenChange={open => !open && setReset(null)}><DialogContent>
      <DialogTitle>{reset === 'demo' ? 'Load sample data?' : 'Start over?'}</DialogTitle>
      <DialogDescription>{reset === 'demo' ? 'This replaces everything with a month of example purchases and investments.' : 'This deletes all purchases, investments and settings.'}</DialogDescription>
      <div className="dialog-buttons"><Button variant="outline" onClick={() => setReset(null)}>Cancel</Button><Button className={reset === 'empty' ? 'btn-danger' : ''} onClick={async () => { try { await mutate(() => reset === 'demo' ? demoPortfolio() : emptyPortfolio(), { replace: true }); notify(reset === 'demo' ? 'Sample data loaded.' : 'Your account has been cleared.'); setReset(null); } catch (e) { notify((e as Error).message); } }}>{reset === 'demo' ? 'Load sample data' : 'Delete everything'}</Button></div>
    </DialogContent></Dialog>
    {notice && <div className="toast" role="status"><Check size={17} /><p>{notice}</p><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
  </div>;
}

function Home({ state, mutate, notify, onPurchase, onHelp }: { state: Portfolio; mutate: Mutate; notify: Notify; onPurchase: () => void; onHelp: () => void }) {
  const { name } = useProfile(), { prices } = useMarkets();
  const b = balances(state), pv = portfolioValue(state, prices), total = b.savings + pv.valueCents + b.risk;
  const [days, setDays] = useState(30), [goalOpen, setGoalOpen] = useState(false);
  const hour = new Date().getHours(), greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const purchases = state.ledger.filter(e => e.kind === 'purchase').length;
  const saved = b.savings + pv.valueCents, progress = Math.min(100, saved / state.goal.targetCents * 100);
  const parts = [{ key: 'savings', label: 'Savings', value: b.savings }, { key: 'invested', label: 'Investments', value: pv.valueCents }, { key: 'sports', label: 'Sports Lab', value: b.risk }];
  const rule = state.autoInvest;
  return <>
    <PageTitle title={name ? `${greeting}, ${name.split(' ')[0]}` : greeting} />
    <section className="card hero">
      <div className="hero-top">
        <div><span className="label">Total balance</span><strong className="hero-amount">{money(total)}</strong>
          {pv.costCents > 0 && pv.priced && <span className={`hero-change ${pv.gainCents >= 0 ? 'up' : 'down'}`}>Investments {pv.gainCents >= 0 ? 'up' : 'down'} {money(Math.abs(pv.gainCents))} ({signedPercent(pv.gainPercent, 1)})</span>}</div>
        <div className="hero-actions"><Button onClick={onPurchase}><Plus size={17} />Add a purchase</Button><Link href="/invest" className="btn btn-outline"><LineChart size={16} />Invest</Link></div>
      </div>
      <div className="split-bar" aria-hidden="true">{parts.map(p => <i key={p.key} className={`seg-${p.key}`} style={{ flexGrow: total ? p.value : 1 }} />)}</div>
      <div className="split-legend">{parts.map(p => <div key={p.key}><span><i className={`dot seg-${p.key}`} />{p.label}</span><strong>{money(p.value)}</strong></div>)}</div>
    </section>

    {purchases === 0 && <section className="card steps"><h2>How it works</h2><ol>
      <li><span>1</span><div><strong>Add a purchase</strong><p>Bought a $4.35 coffee? It rounds up to $5.00, and the $0.65 goes to savings.</p></div></li>
      <li><span>2</span><div><strong>Watch your savings grow</strong><p>Small change from every purchase adds up on its own.</p></div></li>
      <li><span>3</span><div><strong>Invest it</strong><p>Put your savings into the S&P 500 or other funds, or let auto-invest do it for you.</p></div></li>
    </ol><Button onClick={onPurchase}><Plus size={16} />Add your first purchase</Button></section>}

    <div className="grid-2">
      <Card title="Your money over time" action={<div className="segmented segmented-sm">{[[30, '1M'], [90, '3M'], [365, '1Y']].map(([value, label]) => <button key={value} type="button" className={days === value ? 'selected' : ''} aria-pressed={days === value} onClick={() => setDays(Number(value))}>{label}</button>)}</div>}>
        <ActivityChart state={state} days={days} visible={{ savings: true, invested: true }} />
        <div className="chart-key"><span><i className="dot seg-savings" />Savings</span><span><i className="dot seg-invested" />Invested</span></div>
      </Card>
      <Card title="Savings goal" action={<button type="button" className="link-btn" onClick={() => setGoalOpen(true)}>Edit</button>}>
        <div className="goal">
          <span className="goal-icon"><Target size={22} /></span>
          <strong className="goal-name">{state.goal.name}</strong>
          <div className="goal-amounts"><strong>{money(saved)}</strong><span>of {money(state.goal.targetCents)}</span></div>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Savings goal progress"><i style={{ width: `${progress}%` }} /></div>
          <p className="muted">{progress >= 100 ? 'You reached your goal! Set a new one.' : `${money(Math.max(0, state.goal.targetCents - saved))} to go. Savings and investments both count.`}</p>
        </div>
      </Card>
    </div>

    <div className="grid-2">
      <Card title="Recent activity" action={<Link href="/activity" className="link-btn">See all</Link>}>
        <ActivityList entries={state.ledger.slice(-5).reverse()} />
        {!state.ledger.length && <Empty title="Nothing here yet" description="Your purchases and investments will show up here." />}
      </Card>
      <Card title="Auto-invest" action={<Link href="/invest" className="link-btn">Change</Link>}>
        <div className="auto-summary">
          <span className={`status-pill ${rule.enabled ? 'on' : ''}`}>{rule.enabled ? 'On' : 'Off'}</span>
          <p>{rule.enabled ? <>When your savings reach <strong>{money(rule.thresholdCents)}</strong>, we invest <strong>{rule.percent}%</strong> of it into {rule.mix.map(m => `${m.name} (${m.weight}%)`).join(', ')}.</> : 'Turn on auto-invest to put your savings into the market automatically.'}</p>
          <Link href="/invest" className="btn btn-outline btn-sm"><Repeat size={14} />{rule.enabled ? 'Manage auto-invest' : 'Set up auto-invest'}</Link>
        </div>
        <button type="button" className="help-row" onClick={onHelp}><CircleHelp size={16} />New here? See how the app works</button>
      </Card>
    </div>
    <GoalDialog open={goalOpen} onOpenChange={setGoalOpen} state={state} mutate={mutate} notify={notify} />
  </>;
}

function GoalDialog({ open, onOpenChange, state, mutate, notify }: { open: boolean; onOpenChange: (open: boolean) => void; state: Portfolio; mutate: Mutate; notify: Notify }) {
  const [name, setName] = useState(state.goal.name), [target, setTarget] = useState((state.goal.targetCents / 100).toFixed(2)), [error, setError] = useState('');
  useEffect(() => { if (open) { setName(state.goal.name); setTarget((state.goal.targetCents / 100).toFixed(2)); setError(''); } }, [open, state.goal]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogTitle>Your savings goal</DialogTitle><DialogDescription>What are you saving for?</DialogDescription>
    <form className="stack" onSubmit={async e => { e.preventDefault(); try { const targetCents = parseAmount(target); if (targetCents < 100) throw new Error('Set a goal of at least $1.00.'); await mutate(s => ({ ...s, goal: { name: name.trim(), targetCents } })); onOpenChange(false); notify('Goal updated.'); } catch (err) { setError((err as Error).message); } }}>
      <label className="field">Goal<input value={name} onChange={e => setName(e.target.value)} maxLength={60} required placeholder="Emergency fund" /></label>
      <label className="field">Amount<span className="money-field"><span>$</span><input value={target} onChange={e => setTarget(e.target.value)} inputMode="decimal" required /></span></label>
      {error && <div className="notice notice-error">{error}</div>}
      <Button type="submit" className="full-width">Save goal</Button>
    </form>
  </DialogContent></Dialog>;
}

type Row = { id: string; type: 'purchase' | 'investment' | 'sports' | 'transfer'; icon: LucideIcon; title: string; detail: string; amount: string; amountClass?: string; secondary?: string };
function describe(entry: LedgerEntry): Row {
  if (entry.kind === 'purchase') return { id: entry.id, type: 'purchase', icon: entry.category === 'Food & drink' ? Coffee : entry.category === 'Groceries' ? ShoppingCart : ShoppingBag, title: entry.merchant, detail: `${entry.category} · ${shortDate(entry.at)}`, amount: money(entry.amountCents), secondary: entry.roundupCents ? `+${money(entry.roundupCents)} saved` : 'No change to round up' };
  if (entry.kind === 'trade') return { id: entry.id, type: 'investment', icon: entry.side === 'buy' ? ArrowDownLeft : ArrowUpRight, title: `${entry.side === 'buy' ? 'Bought' : 'Sold'} ${entry.name}`, detail: `${entry.auto ? 'Auto-invest · ' : ''}${shortDate(entry.at)}`, amount: `${entry.side === 'buy' ? '−' : '+'}${money(entry.amountCents)}`, amountClass: entry.side === 'sell' ? 'up' : '', secondary: `${entry.shares < 1 ? entry.shares.toPrecision(3) : entry.shares.toFixed(4)} shares` };
  if (entry.kind === 'outcome') return { id: entry.id, type: 'sports', icon: Trophy, title: `Sports Lab ${entry.won ? 'win' : 'loss'}`, detail: `${entry.scenario.event} · ${shortDate(entry.at)}`, amount: signedMoney(entry.netCents, money), amountClass: entry.netCents >= 0 ? 'up' : 'down', secondary: 'Pretend money' };
  return { id: entry.id, type: 'transfer', icon: PiggyBank, title: 'Moved to savings', detail: shortDate(entry.at), amount: `+${money(entry.amountCents)}`, amountClass: 'up', secondary: 'From Sports Lab' };
}
function ActivityList({ entries }: { entries: LedgerEntry[] }) {
  return <ul className="rows">{entries.map(describe).map(r => { const Icon = r.icon; return <li key={r.id} className="row"><span className={`row-icon icon-${r.type}`}><Icon size={17} /></span><span className="row-main"><strong>{r.title}</strong><small>{r.detail}</small></span><span className="row-end"><strong className={r.amountClass}>{r.amount}</strong>{r.secondary && <small>{r.secondary}</small>}</span></li>; })}</ul>;
}

function Activity({ state, onPurchase }: { state: Portfolio; onPurchase: () => void }) {
  const [filter, setFilter] = useState<'all' | Row['type']>('all'), [search, setSearch] = useState('');
  const rows = useMemo(() => [...state.ledger].reverse().filter(e => { const r = describe(e); return (filter === 'all' || r.type === filter) && `${r.title} ${r.detail}`.toLowerCase().includes(search.toLowerCase()); }), [state.ledger, filter, search]);
  function download() {
    const quote = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const csv = ['Date,Type,Description,Amount', ...rows.map(e => { const r = describe(e); return [e.at, r.type, quote(r.title), quote(r.amount)].join(','); })].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), a = document.createElement('a');
    a.href = url; a.download = 'wolf-of-claude-street-activity.csv'; a.click(); URL.revokeObjectURL(url);
  }
  const b = balances(state);
  return <>
    <PageTitle title="Activity" subtitle={`${state.ledger.filter(e => e.kind === 'purchase').length} purchases · ${money(b.roundups)} in spare change saved`}><Button variant="outline" onClick={download}><Download size={15} />Download</Button><Button onClick={onPurchase}><Plus size={16} />Add a purchase</Button></PageTitle>
    <section className="card">
      <div className="toolbar">
        <div className="segmented">{([['all', 'All'], ['purchase', 'Purchases'], ['investment', 'Investments'], ['sports', 'Sports Lab']] as const).map(([key, label]) => <button key={key} type="button" className={filter === key ? 'selected' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
        <label className="search"><Search size={16} /><input aria-label="Search activity" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} /></label>
      </div>
      <ActivityList entries={rows} />
      {!rows.length && <Empty title="Nothing found" description={state.ledger.length ? 'Try a different search or filter.' : 'Add a purchase to get started.'} />}
    </section>
  </>;
}

function PurchaseForm({ state, mutate, notify, onClose }: { state: Portfolio; mutate: Mutate; notify: Notify; onClose: () => void }) {
  const [merchant, setMerchant] = useState(''), [amount, setAmount] = useState(''), [category, setCategory] = useState('Food & drink'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const purchaseId = useRef(id()), { prices } = useMarkets();
  let cents = 0, preview = { roundupCents: 0, savingsCents: 0, riskCents: 0 };
  try { cents = parseAmount(amount); preview = purchaseAllocation(state, cents); } catch { cents = 0; }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      let invested = 0;
      await mutate(s => { const next = addPurchase(s, { id: purchaseId.current, merchant: merchant.trim() || category, category, amount }); const auto = runAutoInvest(next, prices); invested = auto.investedCents; return auto.state; });
      notify(`${money(preview.roundupCents)} added to your savings.${invested ? ` Auto-invest put ${money(invested)} into the market.` : ''}`);
      onClose();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return <form onSubmit={submit}>
    <DialogTitle>Add a purchase</DialogTitle>
    <DialogDescription>We’ll round it up to the next dollar and save the change.</DialogDescription>
    <div className="stack">
      <label className="field">Amount<span className="money-field money-field-lg"><span>$</span><input aria-label="Purchase amount" inputMode="decimal" placeholder="4.35" value={amount} onChange={e => setAmount(e.target.value)} autoFocus required /></span></label>
      <label className="field">Where<input value={merchant} onChange={e => setMerchant(e.target.value)} maxLength={80} placeholder="e.g. Corner Coffee" /></label>
      <label className="field">Category<select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <div className="preview-box">
        {cents ? <><div className="preview-main"><span>Spare change</span><strong>{money(preview.roundupCents)}</strong></div>
          <p>{money(cents)} rounds up to {money(cents + preview.roundupCents)}. {preview.riskCents ? <>{money(preview.savingsCents)} goes to savings and {money(preview.riskCents)} to Sports Lab.</> : preview.roundupCents ? 'All of it goes to savings.' : 'Whole-dollar purchases have no change to save.'}</p></>
          : <p>Enter an amount to see how much you’ll save.</p>}
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <Button type="submit" className="full-width btn-lg" disabled={!cents || busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}Add purchase</Button>
    </div>
  </form>;
}

function HowItWorks({ onStart }: { onStart: () => void }) {
  return <>
    <DialogTitle>How it works</DialogTitle>
    <DialogDescription>Three simple steps. Everything here uses pretend money.</DialogDescription>
    <ol className="how">
      <li><span>1</span><div><strong>Round up</strong><p>A $4.35 coffee rounds up to $5.00. The $0.65 of change goes to your savings.</p></div></li>
      <li><span>2</span><div><strong>Invest</strong><p>Use your savings to buy pieces of funds like the S&P 500 — or let auto-invest do it for you.</p></div></li>
      <li><span>3</span><div><strong>Optional: Sports Lab</strong><p>A small, separate pretend budget for learning about odds. Your savings are never used there.</p></div></li>
    </ol>
    <Button className="full-width" onClick={onStart}>Add a purchase</Button>
  </>;
}

function Settings({ state, mutate, notify, onReset }: { state: Portfolio; mutate: Mutate; notify: Notify; onReset: (kind: 'demo' | 'empty') => void }) {
  const { name: savedName, rename } = useProfile();
  const [name, setName] = useState(savedName), [split, setSplit] = useState(state.allocation), [limits, setLimits] = useState<Limits>(state.limits), [error, setError] = useState('');
  const sportsCents = Math.floor(65 * split / 100);
  async function saveSplit() { try { await mutate(s => updateAllocation(s, Math.min(split, s.limits.allocation))); notify('Saved.'); } catch (e) { notify((e as Error).message); } }
  async function saveLimits(e: React.FormEvent) { e.preventDefault(); setError(''); try { await mutate(s => updateAllocation(updateLimits(s, limits), Math.min(s.allocation, limits.allocation))); setSplit(Math.min(split, limits.allocation)); notify('Sports Lab limits saved.'); } catch (err) { setError((err as Error).message); } }
  return <>
    <PageTitle title="Settings" />
    <div className="settings">
      <Card title="Your name">
        <form className="inline-form" onSubmit={e => { e.preventDefault(); try { rename(name); notify('Name saved.'); } catch (err) { notify((err as Error).message); } }}>
          <label className="field">Shown in your greeting (optional)<input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Alex" /></label>
          <Button type="submit" variant="outline" disabled={name.trim() === savedName}>Save</Button>
        </form>
      </Card>

      <Card title="Where your spare change goes">
        <p className="muted">Most of your change goes to savings. You can send a small part to Sports Lab, a pretend budget for learning about odds.</p>
        <div className="slider-field">
          <div className="slider-labels"><span><i className="dot seg-savings" />Savings <strong>{100 - split}%</strong></span><span><i className="dot seg-sports" />Sports Lab <strong>{split}%</strong></span></div>
          <input type="range" min={0} max={state.limits.allocation} value={Math.min(split, state.limits.allocation)} onChange={e => setSplit(Number(e.target.value))} aria-label="Share of spare change for Sports Lab" />
          <p className="muted small">Example: a $4.35 coffee saves $0.65 — {money(65 - sportsCents)} to savings, {money(sportsCents)} to Sports Lab.</p>
        </div>
        <Button onClick={saveSplit} disabled={split === state.allocation}>Save</Button>
      </Card>

      <Card title="Your data">
        <p className="muted">{state.ledger.filter(e => e.kind === 'purchase').length} purchases · {state.ledger.filter(e => e.kind === 'trade').length} trades</p>
        <div className="button-row"><Button variant="outline" onClick={() => onReset('demo')}><RotateCcw size={15} />Load sample data</Button><Button variant="outline" className="btn-danger-outline" onClick={() => onReset('empty')}>Start over</Button></div>
      </Card>

      <Card title="Sports Lab limits">
        <details className="advanced"><summary>Show advanced limits</summary>
          <form className="stack" onSubmit={saveLimits}>
            {([{ key: 'allocation', title: 'Most spare change Sports Lab can get', max: 20, min: 0, step: 1 }, { key: 'exposure', title: 'Most you can use on one game', max: 5, min: 0.1, step: 0.1 }, { key: 'dailyLoss', title: 'Most you can lose in a day', max: 10, min: 0.1, step: 0.1 }] as const).map(f => <label key={f.key} className="field field-row">{f.title}<span className="percent-field"><input type="number" aria-label={f.title} min={f.min} max={f.max} step={f.step} value={limits[f.key]} onChange={e => setLimits({ ...limits, [f.key]: Number(e.target.value) })} required /><span>%</span></span></label>)}
            {error && <div className="notice notice-error" role="alert">{error}</div>}
            <Button type="submit" variant="outline">Save limits</Button>
          </form>
        </details>
        <p className="muted small"><ShieldCheck size={14} />Your savings and investments can never be used in Sports Lab.</p>
      </Card>
    </div>
  </>;
}

function ReviewReport({ state }: { state: Portfolio }) {
  const review = state.reviews[0] ?? generateReview(state);
  return <div className="review"><p className="review-summary"><ShieldCheck size={20} />{review.summary}</p><ul>{review.facts.map(fact => <li key={fact}><Check size={15} />{fact}</li>)}</ul><small className="muted">Recorded {new Date(review.at).toLocaleString('en-US')}</small></div>;
}
