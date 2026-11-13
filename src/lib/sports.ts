import { z } from 'zod';

export const SPORTS = ['NBA', 'NFL', 'NHL', 'MLB', 'Soccer'] as const;
export type Sport = typeof SPORTS[number];
export const LEAGUES = [
  { sport: 'NBA', path: 'basketball/nba', name: 'NBA' },
  { sport: 'NFL', path: 'football/nfl', name: 'NFL' },
  { sport: 'NHL', path: 'hockey/nhl', name: 'NHL' },
  { sport: 'MLB', path: 'baseball/mlb', name: 'MLB' },
  { sport: 'Soccer', path: 'soccer/eng.1', name: 'Premier League' },
  { sport: 'Soccer', path: 'soccer/esp.1', name: 'La Liga' },
  { sport: 'Soccer', path: 'soccer/ger.1', name: 'Bundesliga' },
  { sport: 'Soccer', path: 'soccer/ita.1', name: 'Serie A' },
  { sport: 'Soccer', path: 'soccer/fra.1', name: 'Ligue 1' },
  { sport: 'Soccer', path: 'soccer/usa.1', name: 'MLS' },
  { sport: 'Soccer', path: 'soccer/uefa.champions', name: 'UEFA Champions League' },
  { sport: 'Soccer', path: 'soccer/fifa.worldq.uefa', name: 'World Cup Qualifying · UEFA' },
  { sport: 'Soccer', path: 'soccer/fifa.worldq.conmebol', name: 'World Cup Qualifying · CONMEBOL' },
  { sport: 'Soccer', path: 'soccer/fifa.friendly', name: 'International Friendlies' },
] as const;

export const sportsEventSchema = z.object({
  id: z.string(), sport: z.enum(SPORTS), league: z.string(), name: z.string(),
  startsAt: z.string(), status: z.enum(['Upcoming', 'Live', 'Final', 'Postponed', 'Canceled', 'Delayed']),
  detail: z.string(), teams: z.array(z.object({ id: z.string(), name: z.string(), score: z.string().optional() })).length(2),
});
export type SportsEvent = z.infer<typeof sportsEventSchema>;
export const scheduleSchema = z.object({
  source: z.literal('ESPN public scoreboard'), date: z.string(), timeZone: z.string(), fetchedAt: z.string(),
  events: z.array(sportsEventSchema), warnings: z.array(z.string()),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export function localDate(at: Date | string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const providerStatus = z.object({ type: z.object({ name: z.string(), state: z.string(), completed: z.boolean().optional(), detail: z.string().optional(), shortDetail: z.string().optional() }) });
const providerEvent = z.object({
  id: z.string(), date: z.string(), name: z.string(), status: providerStatus.optional(),
  competitions: z.array(z.object({ status: providerStatus.optional(), competitors: z.array(z.object({
    team: z.object({ id: z.string(), displayName: z.string() }), score: z.string().optional(),
  })) })),
});

export function normalizeScoreboard(raw: unknown, league: typeof LEAGUES[number], date: string, timeZone: string): SportsEvent[] {
  const data = z.object({ events: z.array(providerEvent), leagues: z.array(z.object({ name: z.string() })).optional() }).parse(raw);
  return data.events.flatMap(event => {
    if (!Number.isFinite(Date.parse(event.date))) throw new Error('Provider returned an invalid game time.');
    if (localDate(event.date, timeZone) !== date) return [];
    const competition = event.competitions[0], type = (competition?.status ?? event.status)?.type;
    if (!type || competition.competitors.length !== 2) throw new Error('Incomplete scoreboard data.');
    const name = type.name.toUpperCase();
    const status: SportsEvent['status'] = name.includes('POSTPON') ? 'Postponed' : name.includes('CANCEL') ? 'Canceled' : name.includes('DELAY') || name.includes('SUSPEND') ? 'Delayed' : type.completed || type.state === 'post' ? 'Final' : type.state === 'in' ? 'Live' : 'Upcoming';
    return [{ id: `${league.path}:${event.id}`, sport: league.sport, league: data.leagues?.[0]?.name ?? league.name,
      name: event.name, startsAt: new Date(event.date).toISOString(), status,
      detail: type.shortDetail ?? type.detail ?? status,
      teams: competition.competitors.map(c => ({ id: c.team.id, name: c.team.displayName, ...(status !== 'Upcoming' && c.score !== undefined ? { score: c.score } : {}) })),
    }];
  });
}
