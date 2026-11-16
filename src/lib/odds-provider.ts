import { ODDS_LEAGUES, mergeBoards, normalizeKalshi, normalizePolymarket, type OddsBoard } from './odds';

// Only fixed public, read-only endpoints are contacted. No keys, accounts or user data.
const cache = new Map<string, { expiresAt: number; data: unknown }>();
async function getJson(url: string, fetcher: typeof fetch) {
  const hit = cache.get(url), useCache = fetcher === fetch;
  if (useCache && hit && hit.expiresAt > Date.now()) return hit.data;
  const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (useCache) cache.set(url, { expiresAt: Date.now() + 55_000, data });
  return data;
}

export async function getOddsBoard(now = new Date(), fetcher: typeof fetch = fetch): Promise<OddsBoard> {
  for (const [key, value] of cache) if (value.expiresAt <= Date.now()) cache.delete(key);
  const since = now.toISOString().slice(0, 19) + 'Z';
  const results = await Promise.all(ODDS_LEAGUES.map(async league => {
    const [poly, kalshi] = await Promise.allSettled([
      getJson(`https://gamma-api.polymarket.com/events?series_id=${league.polymarket}&closed=false&end_date_min=${since}&order=startDate&ascending=true&limit=50`, fetcher).then(raw => normalizePolymarket(raw, league, now)),
      getJson(`https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=${league.kalshi}&status=open&limit=200`, fetcher).then(raw => normalizeKalshi(raw, league, now)),
    ]);
    return { league, poly, kalshi };
  }));
  const failures = results.flatMap(r => [r.poly, r.kalshi]).filter(r => r.status === 'rejected').length;
  if (failures === results.length * 2) throw new Error('Prediction market odds are unavailable right now.');
  const games = mergeBoards(
    results.flatMap(r => r.poly.status === 'fulfilled' ? r.poly.value : []),
    results.flatMap(r => r.kalshi.status === 'fulfilled' ? r.kalshi.value : []), 7, now);
  const warnings = results.flatMap(r => [
    ...(r.poly.status === 'rejected' ? [`${r.league.name}: Polymarket unavailable`] : []),
    ...(r.kalshi.status === 'rejected' ? [`${r.league.name}: Kalshi unavailable`] : []),
  ]);
  return { fetchedAt: now.toISOString(), games: games.slice(0, 150), warnings };
}
