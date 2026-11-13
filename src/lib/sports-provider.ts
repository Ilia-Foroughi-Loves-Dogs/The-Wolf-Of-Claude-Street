import { LEAGUES, localDate, normalizeScoreboard, type Schedule } from './sports';

const scoreboards = new Map<string, { expiresAt: number; data: unknown }>();
const pending = new Map<string, Promise<unknown>>();
async function fetchScoreboard(url: string, fetcher: typeof fetch) {
  const cached = scoreboards.get(url), useCache = fetcher === fetch;
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.data;
  if (useCache && pending.has(url)) return pending.get(url)!;
  const request = (async () => {
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (useCache) scoreboards.set(url, { expiresAt: Date.now() + 55_000, data });
    return data;
  })();
  if (useCache) pending.set(url, request);
  try { return await request; } finally { if (useCache) pending.delete(url); }
}

// Only fixed public ESPN endpoints are contacted. No credentials or user-controlled URLs.
export async function getTodaySchedule(timeZone: string, now = new Date(), fetcher: typeof fetch = fetch): Promise<Schedule> {
  // A bounded cache deduplicates viewers but never serves expired data on error.
  for (const [key, value] of scoreboards) if (value.expiresAt <= Date.now()) scoreboards.delete(key);
  const date = localDate(now, timeZone);
  // ESPN groups schedules by its own calendar day. Fetch adjacent days as well,
  // then filter by the viewer's calendar date (including DST and UTC rollover).
  const anchor = Date.parse(`${date}T12:00:00Z`);
  const day = (offset: number) => new Date(anchor + offset * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
  const dates = [day(-1),day(0),day(1)];
  const results = await Promise.allSettled(LEAGUES.map(async league => {
    // Some ESPN leagues reject date ranges; request concrete days instead.
    const days = await Promise.all(dates.map(async providerDate => {
      const data = await fetchScoreboard(`https://site.api.espn.com/apis/site/v2/sports/${league.path}/scoreboard?dates=${providerDate}&limit=100`, fetcher);
      return normalizeScoreboard(data, league, date, timeZone);
    }));
    return days.flat();
  }));
  if (results.every(result => result.status === 'rejected')) throw new Error('Sports schedules are unavailable. Please try again shortly. No example games have been substituted.', { cause: new AggregateError(results.map(result => result.reason)) });
  const events = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  return {
    source: 'ESPN public scoreboard', date, timeZone, fetchedAt: now.toISOString(),
    events: [...new Map(events.map(event => [event.id, event])).values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    warnings: results.flatMap((result, index) => result.status === 'rejected' ? [`${LEAGUES[index].name}: schedule unavailable; no games substituted.`] : []),
  };
}
