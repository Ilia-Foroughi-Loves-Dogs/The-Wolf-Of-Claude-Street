import { z } from 'zod';
import { kalshiResult, polymarketResult, type MarketResult } from '@/lib/odds';

export const runtime = 'nodejs';

// Looks up the real result of picked games on fixed public endpoints.
// Only ids that match strict formats are accepted, so no user-controlled URLs.
const body = z.object({ picks: z.array(z.object({
  id: z.string().max(80),
  settle: z.object({ polymarketEvent: z.string().regex(/^\d{1,12}$/).optional(), polymarketOutcome: z.string().max(120).optional(), kalshiMarket: z.string().regex(/^[A-Z0-9.\-]{3,100}$/).optional() }),
})).max(50) });

const cache = new Map<string, { expiresAt: number; data: unknown }>();
async function getJson(url: string) {
  const hit = cache.get(url);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: unknown = await response.json();
  cache.set(url, { expiresAt: Date.now() + 55_000, data });
  return data;
}

export async function POST(request: Request) {
  let parsed;
  try { parsed = body.parse(await request.json()); } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  for (const [key, value] of cache) if (value.expiresAt <= Date.now()) cache.delete(key);
  const results: Record<string, MarketResult> = {};
  await Promise.all(parsed.picks.map(async pick => {
    let result: MarketResult = 'pending';
    const { kalshiMarket, polymarketEvent, polymarketOutcome } = pick.settle;
    if (kalshiMarket) result = await getJson(`https://api.elections.kalshi.com/trade-api/v2/markets/${kalshiMarket}`).then(kalshiResult).catch(() => 'pending' as const);
    if (result === 'pending' && polymarketEvent && polymarketOutcome) result = await getJson(`https://gamma-api.polymarket.com/events/${polymarketEvent}`).then(raw => polymarketResult(raw, polymarketOutcome)).catch(() => 'pending' as const);
    results[pick.id] = result;
  }));
  return Response.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
