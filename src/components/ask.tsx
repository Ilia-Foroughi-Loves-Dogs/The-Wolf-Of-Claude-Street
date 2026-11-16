"use client";
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Send } from 'lucide-react';
import { Button } from './ui/button';
import { PageTitle } from './ui/kit';
import type { Portfolio, Scenario } from '@/lib/engine';

type Message = { role: 'user' | 'assistant'; text: string; notice?: string };
const SUGGESTIONS = ['How are my investments doing?', 'What is an index fund?', 'How does auto-invest work?', 'How much could I save in six months?', 'Is investing risky?', 'Explain my Sports Lab limits.'];

export function Ask({ state, scenario }: { state: Portfolio; scenario?: Scenario }) {
  const [messages, setMessages] = useState<Message[]>([]), [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [mode, setMode] = useState<'demo' | 'claude' | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { if (messages.length) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setQuestion(''); setError(''); setBusy(true); setMessages(m => [...m, { role: 'user', text: text.trim() }]);
    try {
      const response = await fetch('/api/advisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text.trim(), portfolio: state, scenario }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMode(data.mode); setMessages(m => [...m, { role: 'assistant', text: data.answer, notice: data.notice }]);
    } catch (e) { setError(`${(e as Error).message} Please try again.`); }
    finally { setBusy(false); }
  }
  return <>
    <PageTitle title="Ask a question" subtitle="Get plain-English answers about your savings, investments and how the app works." />
    {mode === 'demo' && <div className="notice"><p><strong>Demo mode:</strong> answers are built-in explanations for common questions. Add an Anthropic API key to <code>.env.local</code> for full AI answers.</p></div>}
    <section className="card chat">
      <div className="chat-log" aria-live="polite">
        {!messages.length && <div className="chat-start"><p>Try one of these:</p><div className="chips">{SUGGESTIONS.map(text => <button key={text} type="button" className="chip" onClick={() => ask(text)}>{text}</button>)}</div></div>}
        {messages.map((m, i) => <div key={i} className={`bubble bubble-${m.role}`}><p>{m.text}</p>{m.notice && <small>{m.notice}</small>}</div>)}
        {busy && <div className="bubble bubble-assistant bubble-typing"><LoaderCircle className="spin" size={15} />Thinking…</div>}
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <div ref={bottom} />
      </div>
      <form className="chat-input" onSubmit={e => { e.preventDefault(); ask(question); }}>
        <input aria-label="Your question" placeholder="Type your question…" value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} disabled={busy} />
        <Button type="submit" disabled={!question.trim() || busy} aria-label="Send question"><Send size={16} />Send</Button>
      </form>
    </section>
    <p className="footnote">Answers explain your numbers — they can’t move money or change settings, and they aren’t financial advice.</p>
  </>;
}
