"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { MarketSnapshot, Quote } from '@/lib/markets';

type Context = { quotes: Quote[]; prices: Record<string, number>; status: 'loading' | 'ready' | 'error'; error: string; fetchedAt: string | null; source: string; refresh: () => Promise<void> };
const MarketContext = createContext<Context | null>(null);

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null), [status, setStatus] = useState<Context['status']>('loading'), [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/markets', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Market prices are unavailable.');
      setSnapshot(data); setStatus('ready'); setError('');
    } catch (e) {
      setError((e as Error).message);
      setStatus(current => current === 'ready' ? 'ready' : 'error');
    }
  }, []);
  useEffect(() => { refresh(); const timer = setInterval(refresh, 60_000); return () => clearInterval(timer); }, [refresh]);
  const value = useMemo<Context>(() => {
    const quotes = snapshot?.quotes ?? [];
    return { quotes, prices: Object.fromEntries(quotes.map(q => [q.symbol, q.price])), status, error, fetchedAt: snapshot?.fetchedAt ?? null, source: snapshot?.source ?? '', refresh };
  }, [snapshot, status, error, refresh]);
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}
export function useMarkets() { const value = useContext(MarketContext); if (!value) throw new Error('Missing market provider'); return value; }
