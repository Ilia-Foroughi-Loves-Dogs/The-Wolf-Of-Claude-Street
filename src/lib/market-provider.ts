import { MARKETS, type MarketInfo, type MarketSnapshot, type Quote } from './markets';

const SOURCE = 'Yahoo Finance public chart data (may be delayed)';
let cache: { expiresAt: number; data: MarketSnapshot } | null = null;
let pending: Promise<MarketSnapshot> | null = null;

type ChartResponse = { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketTime?: number }; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };

export function normalizeChart(info: MarketInfo, body: ChartResponse): Quote | null {
  const result = body.chart?.result?.[0];
  const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
  const price = result?.meta?.regularMarketPrice;
  if (!price || !Number.isFinite(price) || price <= 0 || closes.length < 2) return null;
  // The last close is today's (possibly partial) bar; the one before it is yesterday.
  const previousClose = closes.at(-2)!;
  const step = Math.max(1, Math.floor(closes.length / 60));
  const history = closes.filter((_, i) => i % step === 0 || i === closes.length - 1).slice(-61);
  history[history.length - 1] = price;
  return {
    ...info,
    price,
    previousClose,
    changePercent: (price - previousClose) / previousClose * 100,
    yearChangePercent: closes.length > 200 ? (price - closes[0]) / closes[0] * 100 : null,
    history,
    asOf: new Date((result?.meta?.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(),
  };
}

async function fetchQuote(info: MarketInfo, fetcher: typeof fetch) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(info.symbol)}?range=1y&interval=1d`;
  const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const quote = normalizeChart(info, await response.json() as ChartResponse);
  if (!quote) throw new Error('No price');
  return quote;
}

// Only fixed symbols from MARKETS are requested. Results are cached for 60 seconds.
export async function getMarketSnapshot(fetcher: typeof fetch = fetch): Promise<MarketSnapshot> {
  const useCache = fetcher === fetch;
  if (useCache && cache && cache.expiresAt > Date.now()) return cache.data;
  if (useCache && pending) return pending;
  const request = (async () => {
    const results = await Promise.allSettled(MARKETS.map(info => fetchQuote(info, fetcher)));
    const quotes = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
    if (!quotes.length) throw new Error('No market data available.');
    const data: MarketSnapshot = { quotes, fetchedAt: new Date().toISOString(), source: SOURCE, missing: MARKETS.filter((_, i) => results[i].status === 'rejected').map(m => m.symbol) };
    if (useCache) cache = { expiresAt: Date.now() + 60_000, data };
    return data;
  })();
  if (useCache) pending = request;
  try { return await request; } finally { if (useCache) pending = null; }
}
