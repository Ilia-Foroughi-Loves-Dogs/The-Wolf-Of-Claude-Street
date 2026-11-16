"use client";
import { useEffect, useRef } from 'react';
import { money, pendingPicks, scenarioMetrics, settlePick, type PickResult, type Portfolio } from '@/lib/engine';

const CHECK_AFTER = 90 * 60_000;        // games run at least ~1.5 hours
const GIVE_UP_AFTER = 7 * 86400_000;    // no result a week later: refund the stake

/** Checks pending picks against the markets' real results every minute and settles them. */
export function usePickSettlement(state: Portfolio, ready: boolean, mutate: (fn: (s: Portfolio) => Portfolio) => Promise<void>, notify: (message: string) => void) {
  const latest = useRef(state); latest.current = state;
  useEffect(() => {
    if (!ready) return;
    let stopped = false, running = false;
    async function check() {
      if (running || stopped) return;
      const now = Date.now();
      const due = pendingPicks(latest.current).filter(p => now - Date.parse(p.scenario.legs?.[0]?.startsAt ?? '') >= CHECK_AFTER);
      if (!due.length) return;
      running = true;
      try {
        const settled: Record<string, PickResult> = {};
        const lookups = due.filter(p => p.scenario.legs?.[0]?.settle).slice(0, 50);
        if (lookups.length) {
          const response = await fetch('/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ picks: lookups.map(p => ({ id: p.id, settle: p.scenario.legs![0].settle })) }) });
          if (response.ok) for (const [id, result] of Object.entries((await response.json()).results as Record<string, string>)) if (result === 'won' || result === 'lost' || result === 'void') settled[id] = result;
        }
        for (const p of due) if (!settled[p.id] && now - Date.parse(p.scenario.legs![0].startsAt) > GIVE_UP_AFTER) settled[p.id] = 'void';
        if (stopped || !Object.keys(settled).length) return;
        await mutate(s => Object.entries(settled).reduce((next, [id, result]) => settlePick(next, id, result), s));
        for (const p of due) {
          const result = settled[p.id], team = p.scenario.legs?.[0]?.team ?? 'Your team';
          if (result === 'won') notify(`${team} won! Your pick paid ${money(scenarioMetrics(p.scenario).payout)}.`);
          else if (result === 'lost') notify(`${team} lost. Your ${money(p.scenario.stakeCents)} pick didn’t pay out.`);
          else if (result === 'void') notify(`${team}’s game had no result, so your ${money(p.scenario.stakeCents)} was refunded.`);
        }
      } catch { /* try again next minute */ }
      finally { running = false; }
    }
    void check();
    const timer = setInterval(() => void check(), 60_000);
    return () => { stopped = true; clearInterval(timer); };
  }, [ready, mutate, notify]);
}
