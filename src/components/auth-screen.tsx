"use client";
import { useState } from 'react';
import { Check, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { validateSignUp } from '@/lib/accounts';
import { Button } from './ui/button';
import { WolfMark } from './ui/kit';
import type { AuthActions, StartWith } from './account-provider';

export function AuthScreen({ signUp, logIn, hasDeviceData }: AuthActions) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [show, setShow] = useState(false);
  const [startWith, setStartWith] = useState<StartWith>(hasDeviceData ? 'existing' : 'sample');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setError('');
    if (mode === 'signup') { const problem = validateSignUp({ name, email, password }); if (problem) { setError(problem); return; } }
    setBusy(true);
    try { if (mode === 'signup') await signUp({ name, email, password, startWith }); else await logIn(email, password); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }
  const switchMode = (next: 'signup' | 'login') => { setMode(next); setError(''); };

  return <div className="auth">
    <section className="auth-intro">
      <div className="logo"><span className="logo-mark"><WolfMark size={22} /></span>Wolf of Claude Street</div>
      <h1>Save your spare change. Invest it automatically.</h1>
      <ul className="auth-points">
        <li><Check size={18} />Every purchase rounds up to the next dollar. The change goes into savings.</li>
        <li><Check size={18} />Put your savings into the S&P 500 and other funds with one tap.</li>
        <li><Check size={18} />Turn on auto-invest and it happens by itself.</li>
      </ul>
      <p className="auth-note">This is a practice app. Market prices are real, but the money is pretend — nothing is charged and no bank is connected.</p>
    </section>

    <section className="auth-card">
      <div className="logo logo-mobile"><span className="logo-mark"><WolfMark size={20} /></span>Wolf of Claude Street</div>
      <h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
      <p className="muted">{mode === 'signup' ? 'It takes less than a minute.' : 'Log in to see your savings and investments.'}</p>
      <form onSubmit={submit} className="stack" noValidate>
        {mode === 'signup' && <label className="field">Your name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Alex Morgan" maxLength={60} /></label>}
        <label className="field">Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></label>
        <label className="field">Password
          <span className="password-input"><input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'At least 8 characters' : ''} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
        </label>
        {mode === 'signup' && <fieldset className="choice-group"><legend>Start with</legend>
          {hasDeviceData && <label className={`choice ${startWith === 'existing' ? 'selected' : ''}`}><input type="radio" name="start" checked={startWith === 'existing'} onChange={() => setStartWith('existing')} /><span><strong>The data already on this device</strong><small>Keep the purchases and investments you’ve added.</small></span></label>}
          <label className={`choice ${startWith === 'sample' ? 'selected' : ''}`}><input type="radio" name="start" checked={startWith === 'sample'} onChange={() => setStartWith('sample')} /><span><strong>Sample data</strong><small>A month of example purchases so you can look around.</small></span></label>
          <label className={`choice ${startWith === 'blank' ? 'selected' : ''}`}><input type="radio" name="start" checked={startWith === 'blank'} onChange={() => setStartWith('blank')} /><span><strong>A fresh start</strong><small>An empty account. Add your first purchase yourself.</small></span></label>
        </fieldset>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <Button type="submit" className="full-width btn-lg" disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />}{mode === 'signup' ? 'Create account' : 'Log in'}</Button>
      </form>
      <p className="auth-switch">{mode === 'signup' ? <>Already have an account? <button type="button" onClick={() => switchMode('login')}>Log in</button></> : <>New here? <button type="button" onClick={() => switchMode('signup')}>Create an account</button></>}</p>
      <p className="auth-fine">Your account is saved in this browser on this device only.</p>
    </section>
  </div>;
}
