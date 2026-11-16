import { z } from 'zod';

// Upcoming games with win chances taken from public prediction markets
// (Polymarket and Kalshi). Prices on those exchanges are dollars per $1
// contract, so a price of 0.70 means the market gives that team about a 70%
// chance. When both exchanges list a game, the chance is their average.

export const ODDS_SPORTS = ['NFL', 'NBA', 'NHL', 'MLB', 'Soccer'] as const;
export type OddsSport = typeof ODDS_SPORTS[number];
export const ODDS_SOURCE = 'Prediction markets' as const;

export const ODDS_LEAGUES = [
  { sport: 'NFL', name: 'NFL', polymarket: '12185', kalshi: 'KXNFLGAME' },
  { sport: 'NBA', name: 'NBA', polymarket: '10345', kalshi: 'KXNBAGAME' },
  { sport: 'NHL', name: 'NHL', polymarket: '10346', kalshi: 'KXNHLGAME' },
  { sport: 'MLB', name: 'MLB', polymarket: '3', kalshi: 'KXMLBGAME' },
  { sport: 'Soccer', name: 'Premier League', polymarket: '10188', kalshi: 'KXEPLGAME' },
  { sport: 'Soccer', name: 'La Liga', polymarket: '10193', kalshi: 'KXLALIGAGAME' },
  { sport: 'Soccer', name: 'Bundesliga', polymarket: '10194', kalshi: 'KXBUNDESLIGAGAME' },
  { sport: 'Soccer', name: 'Serie A', polymarket: '10203', kalshi: 'KXSERIEAGAME' },
  { sport: 'Soccer', name: 'Ligue 1', polymarket: '10195', kalshi: 'KXLIGUE1GAME' },
  { sport: 'Soccer', name: 'MLS', polymarket: '10189', kalshi: 'KXMLSGAME' },
  { sport: 'Soccer', name: 'Champions League', polymarket: '10204', kalshi: 'KXUCLGAME' },
] as const;
export type OddsLeague = typeof ODDS_LEAGUES[number];

const sourcesSchema = z.object({ polymarket: z.number().optional(), kalshi: z.number().optional() });
const settleSchema = z.object({ polymarketEvent: z.string().optional(), polymarketOutcome: z.string().optional(), kalshiMarket: z.string().optional() });
export const oddsTeamSchema = z.object({ id: z.string(), name: z.string(), probability: z.number().gt(0).lt(1), sources: sourcesSchema, settle: settleSchema });
export const oddsGameSchema = z.object({
  id: z.string(), sport: z.enum(ODDS_SPORTS), league: z.string(), name: z.string(),
  startsAt: z.string(), timeKnown: z.boolean(), teams: z.array(oddsTeamSchema).length(2),
  draw: z.number().optional(),
});
export type OddsGame = z.infer<typeof oddsGameSchema>;
export type OddsTeam = z.infer<typeof oddsTeamSchema>;
export const oddsBoardSchema = z.object({ fetchedAt: z.string(), games: z.array(oddsGameSchema), warnings: z.array(z.string()) });
export type OddsBoard = z.infer<typeof oddsBoardSchema>;

// Only games with a real contest are offered: very lopsided prices are skipped.
export const MIN_CHANCE = .03, MAX_CHANCE = .97;
const usable = (p: number) => Number.isFinite(p) && p >= MIN_CHANCE && p <= MAX_CHANCE;
const round3 = (p: number) => Math.round(p * 1000) / 1000;

/** Fair payout for a chance: $1 returns 1/p, rounded down to the cent so it never pays more than fair. */
export function fairMultiplier(probability: number) {
  return Math.min(100, Math.max(1.01, Math.floor(100 / probability) / 100));
}

const norm = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(fc|cf|sc|afc|ac|cd|ud|club|de|the)\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const CODE_ALIASES: Record<string, string> = { JAX: 'JAC', WSH: 'WAS', LAR: 'LA', GSW: 'GS', NOP: 'NO', NYK: 'NY', SAS: 'SA', PHX: 'PHO', UTAH: 'UTA', TBL: 'TB', NJD: 'NJ', LAK: 'LA', SJS: 'SJ', VGK: 'VGS', MAC: 'MCI' };
const code = (value: string) => { const c = value.toUpperCase(); return CODE_ALIASES[c] ?? c; };
const sameName = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

type Draft = OddsGame & { date: string; codes: string[] };

// ---------- Polymarket (gamma-api.polymarket.com/events) ----------
const pmMarket = z.object({
  sportsMarketType: z.string().nullish(), groupItemTitle: z.string().nullish(), question: z.string().nullish(),
  outcomes: z.string().nullish(), outcomePrices: z.string().nullish(), closed: z.boolean().nullish(),
});
const pmEvent = z.object({ id: z.union([z.string(), z.number()]), title: z.string(), slug: z.string(), startTime: z.string().nullish(), eventDate: z.string().nullish(), markets: z.array(pmMarket).nullish() });
const prices = (raw: string | null | undefined) => { try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v.map(Number) : []; } catch { return []; } };
const labels = (raw: string | null | undefined) => { try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };

export function normalizePolymarket(raw: unknown, league: OddsLeague, now = new Date()): Draft[] {
  const events = z.array(z.unknown()).parse(raw).flatMap(e => { const r = pmEvent.safeParse(e); return r.success ? [r.data] : []; });
  return events.flatMap(event => {
    const start = Date.parse(event.startTime ?? '');
    if (!Number.isFinite(start) || start <= now.getTime()) return [];
    const parts = event.slug.split('-');
    // Main game events look like "nba-orl-bos-2026-11-16"; props and halftime events have extra words.
    if (parts.length !== 6 || !/^\d{4}$/.test(parts[3])) return [];
    const open = (event.markets ?? []).filter(m => m.sportsMarketType === 'moneyline' && !m.closed);
    const [nameA, nameB] = event.title.split(/\s+vs\.?\s+/i);
    if (!nameA || !nameB) return [];
    let a: number | undefined, b: number | undefined, draw: number | undefined, labelA = nameA, labelB = nameB;
    if (open.length === 1) {
      const outs = labels(open[0].outcomes), ps = prices(open[0].outcomePrices);
      if (outs.length !== 2 || ps.length !== 2) return [];
      const ia = Math.max(0, outs.findIndex(o => sameName(o, nameA))), ib = ia === 0 ? 1 : 0;
      a = ps[ia]; b = ps[ib]; labelA = outs[ia]; labelB = outs[ib];
    } else {
      // Soccer: one Yes/No market per team plus one for the draw.
      for (const m of open) {
        const yes = prices(m.outcomePrices)[0], title = m.groupItemTitle ?? '';
        if (/^draw/i.test(title)) draw = yes; else if (sameName(title, nameA)) { a = yes; labelA = title; } else if (sameName(title, nameB)) { b = yes; labelB = title; }
      }
    }
    if (a === undefined || b === undefined || !usable(a) || !usable(b)) return [];
    const codes = [code(parts[1]), code(parts[2])];
    return [{
      id: `pm:${event.id}`, sport: league.sport, league: league.name, name: `${nameA} vs ${nameB}`,
      startsAt: new Date(start).toISOString(), timeKnown: true, date: event.eventDate ?? event.startTime!.slice(0, 10), codes,
      teams: [
        { id: codes[0], name: nameA, probability: round3(a), sources: { polymarket: round3(a) }, settle: { polymarketEvent: String(event.id), polymarketOutcome: labelA } },
        { id: codes[1], name: nameB, probability: round3(b), sources: { polymarket: round3(b) }, settle: { polymarketEvent: String(event.id), polymarketOutcome: labelB } }],
      ...(draw !== undefined && usable(draw) ? { draw: round3(draw) } : {}),
    }];
  });
}

// ---------- Kalshi (api.elections.kalshi.com/trade-api/v2/markets) ----------
const kMarket = z.object({
  ticker: z.string(), event_ticker: z.string(), yes_sub_title: z.string().nullish(), status: z.string().nullish(),
  yes_bid_dollars: z.string().nullish(), yes_ask_dollars: z.string().nullish(), last_price_dollars: z.string().nullish(),
  occurrence_datetime: z.string().nullish(), expected_expiration_time: z.string().nullish(),
});
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function kalshiPrice(m: z.infer<typeof kMarket>) {
  const bid = Number(m.yes_bid_dollars), ask = Number(m.yes_ask_dollars), last = Number(m.last_price_dollars);
  if (bid > 0 && ask > 0 && ask >= bid && ask - bid <= .1) return (bid + ask) / 2;
  return last > 0 ? last : NaN;
}

export function normalizeKalshi(raw: unknown, league: OddsLeague, now = new Date()): Draft[] {
  const markets = z.object({ markets: z.array(z.unknown()) }).parse(raw).markets.flatMap(m => { const r = kMarket.safeParse(m); return r.success ? [r.data] : []; });
  const byEvent = new Map<string, typeof markets>();
  for (const m of markets) if (!m.status || m.status === 'active' || m.status === 'open') byEvent.set(m.event_ticker, [...(byEvent.get(m.event_ticker) ?? []), m]);
  return [...byEvent.entries()].flatMap(([eventTicker, group]) => {
    const match = /-(\d{2})([A-Z]{3})(\d{2})/.exec(eventTicker);
    if (!match) return [];
    const date = `20${match[1]}-${String(MONTHS.indexOf(match[2]) + 1).padStart(2, '0')}-${match[3]}`;
    // The ticker lists both teams in order (e.g. ...26NOV23CINWAS); keep that order.
    const order = eventTicker.split('-').at(-1)!.slice(7), suffix = (m: { ticker: string }) => m.ticker.split('-').at(-1)!;
    const teams = group.filter(m => !m.ticker.endsWith('-TIE')).sort((x, y) => order.indexOf(suffix(x)) - order.indexOf(suffix(y)));
    const tie = group.find(m => m.ticker.endsWith('-TIE'));
    if (teams.length !== 2) return [];
    const ps = teams.map(kalshiPrice);
    if (!ps.every(usable)) return [];
    // Kalshi lists when the market settles, not kickoff; estimate the start and only show the date.
    const settles = Date.parse(teams[0].occurrence_datetime ?? teams[0].expected_expiration_time ?? '');
    const start = Number.isFinite(settles) ? settles - (league.sport === 'Soccer' ? 2 : 3) * 3600_000 : Date.parse(`${date}T23:00:00Z`);
    if (start <= now.getTime() + 30 * 60_000) return [];
    const codes = teams.map(m => code(m.ticker.split('-').at(-1)!));
    const names = teams.map(m => m.yes_sub_title ?? m.ticker.split('-').at(-1)!);
    const drawP = tie ? kalshiPrice(tie) : NaN;
    return [{
      id: `kx:${eventTicker}`, sport: league.sport, league: league.name, name: `${names[0]} vs ${names[1]}`,
      startsAt: new Date(start).toISOString(), timeKnown: false, date, codes,
      teams: [0, 1].map(i => ({ id: codes[i], name: names[i], probability: round3(ps[i]), sources: { kalshi: round3(ps[i]) }, settle: { kalshiMarket: teams[i].ticker } })),
      ...(usable(drawP) ? { draw: round3(drawP) } : {}),
    }];
  });
}

// ---------- Merge ----------
function teamMatch(a: OddsTeam, b: OddsTeam) { return code(a.id) === code(b.id) || sameName(a.name, b.name); }

export function mergeBoards(poly: Draft[], kalshi: Draft[], horizonDays = 7, now = new Date()): OddsGame[] {
  const used = new Set<string>(), out: OddsGame[] = [];
  for (const game of poly) {
    const partner = kalshi.find(k => !used.has(k.id) && k.league === game.league && k.date === game.date && k.teams.some(kt => game.teams.some(gt => teamMatch(gt, kt))));
    if (!partner) { out.push(strip(game)); continue; }
    used.add(partner.id);
    const teams = game.teams.map((team, i) => {
      const other = partner.teams.find(kt => teamMatch(team, kt)) ?? partner.teams.find(kt => !game.teams.some(gt => gt !== team && teamMatch(gt, kt))) ?? partner.teams[i];
      const k = other.probability, p = team.probability;
      return { ...team, probability: round3((p + k) / 2), sources: { polymarket: p, kalshi: k }, settle: { ...team.settle, ...other.settle } };
    });
    const draw = game.draw !== undefined && partner.draw !== undefined ? round3((game.draw + partner.draw) / 2) : game.draw ?? partner.draw;
    out.push(strip({ ...game, id: `${game.id}+${partner.id}`, teams, ...(draw !== undefined ? { draw } : {}) }));
  }
  for (const game of kalshi) if (!used.has(game.id)) out.push(strip(game));
  const limit = now.getTime() + horizonDays * 86400_000;
  return out.filter(g => Date.parse(g.startsAt) <= limit).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
function strip({ date: _date, codes: _codes, ...game }: Draft): OddsGame { void _date; void _codes; return game; }

// ---------- Results (settling picks on the real game) ----------
export type MarketResult = 'won' | 'lost' | 'void' | 'pending';
/** Kalshi market (GET /markets/{ticker}): result is "yes"/"no" once finalized. */
export function kalshiResult(raw: unknown): MarketResult {
  const m = z.object({ market: z.object({ status: z.string().nullish(), result: z.string().nullish() }) }).safeParse(raw);
  if (!m.success) return 'pending';
  const { status, result } = m.data.market;
  if (!['settled', 'finalized', 'determined'].includes(status ?? '')) return 'pending';
  return result === 'yes' ? 'won' : result === 'no' ? 'lost' : result ? 'void' : 'pending';
}
/** Polymarket event (GET /events/{id}): a resolved moneyline pays $1 to the winner. */
export function polymarketResult(raw: unknown, outcome: string): MarketResult {
  const e = pmEvent.safeParse(raw);
  if (!e.success) return 'pending';
  const lines = (e.data.markets ?? []).filter(m => m.sportsMarketType === 'moneyline');
  if (!lines.length || lines.some(m => !m.closed)) return 'pending';
  if (lines.length === 1) {
    const outs = labels(lines[0].outcomes), ps = prices(lines[0].outcomePrices), i = outs.findIndex(o => o === outcome || sameName(o, outcome));
    if (i < 0 || ps.length !== outs.length) return 'pending';
    return ps[i] === 1 ? 'won' : ps[i] === 0 ? 'lost' : 'void';
  }
  const mine = lines.find(m => m.groupItemTitle === outcome || sameName(m.groupItemTitle ?? '', outcome));
  if (!mine) return 'pending';
  const yes = prices(mine.outcomePrices)[0];
  return yes === 1 ? 'won' : yes === 0 ? 'lost' : 'void';
}
