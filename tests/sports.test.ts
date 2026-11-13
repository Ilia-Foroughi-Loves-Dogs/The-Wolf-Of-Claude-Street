import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUES, localDate, normalizeScoreboard } from '../src/lib/sports';
import { getTodaySchedule } from '../src/lib/sports-provider';
import { GET } from '../src/app/api/sports/route';

// Synthetic API fixtures are used only in tests, never as application fallbacks.
const event = (id: string, date: string, state = 'pre', name = 'STATUS_SCHEDULED') => ({
  id, date, name: 'Away at Home', status: { type: { name, state, completed: state === 'post', shortDetail: state } },
  competitions: [{ competitors: [{ team: { id: 'a', displayName: 'Away' }, score: '2' }, { team: { id: 'b', displayName: 'Home' }, score: '1' }] }],
});
test('schedules use the local calendar day across UTC midnight and DST', () => {
  assert.equal(localDate('2026-11-14T03:00:00Z', 'America/Los_Angeles'), '2026-11-13');
  assert.equal(localDate('2026-11-13T16:00:00Z', 'Asia/Tokyo'), '2026-11-14');
  assert.equal(localDate('2026-11-01T08:30:00Z', 'America/Los_Angeles'), '2026-11-01');
  const games = normalizeScoreboard({ events: [event('1', '2026-11-14T03:00:00Z'), event('2', '2026-11-13T02:00:00Z'), event('3', '2026-11-14T08:00:00Z')] }, LEAGUES[0], '2026-11-13', 'America/Los_Angeles');
  assert.equal(games.length, 1); assert.equal(games[0].name, 'Away at Home'); assert.equal(games[0].startsAt, '2026-11-14T03:00:00.000Z'); assert.equal(games[0].teams[0].score, undefined);
});
test('actual provider status maps upcoming, live, final, postponed, delayed, canceled', () => {
  for (const [state, name, expected] of [['pre','STATUS_SCHEDULED','Upcoming'], ['in','STATUS_IN_PROGRESS','Live'], ['post','STATUS_FINAL','Final'], ['pre','STATUS_POSTPONED','Postponed'], ['in','STATUS_DELAYED','Delayed'], ['post','STATUS_CANCELED','Canceled']]) {
    const [game] = normalizeScoreboard({ events: [event('1','2026-11-13T12:00:00Z',state,name)] }, LEAGUES[0], '2026-11-13', 'UTC');
    assert.equal(game.status, expected);
  }
  assert.throws(() => normalizeScoreboard({ events: [{ id: 'bad' }] }, LEAGUES[0], '2026-11-13', 'UTC'));
});
test('all requested sports fetch fixed public endpoints, adjacent dates and bounded network requests', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++; assert.match(String(url), /^https:\/\/site.api.espn.com\/apis\/site\/v2\/sports\//);
    assert.match(String(url), /dates=2026111[234]/); assert.equal(init?.cache, 'no-store'); assert(init?.signal);
    return Response.json({ events: [event('1', '2026-11-14T03:00:00Z')] });
  };
  const data = await getTodaySchedule('America/Los_Angeles', new Date('2026-11-13T12:00:00Z'), fetcher);
  assert.equal(calls, LEAGUES.length*3); assert.equal(data.date, '2026-11-13'); assert.equal(data.events.length, LEAGUES.length);
  assert.deepEqual(new Set(data.events.map(game => game.sport)), new Set(['NBA','NFL','NHL','MLB','Soccer']));
});
test('empty schedules remain empty; partial and complete failures never fabricate games', async () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const empty = await getTodaySchedule('UTC', now, async () => Response.json({ events: [] })); assert.deepEqual(empty.events, []); assert.deepEqual(empty.warnings, []);
  const partial = await getTodaySchedule('UTC', now, async url => String(url).includes('basketball/nba') ? Response.json({ events: [event('1','2026-11-13T12:00:00Z')] }) : new Response('', { status: 503 }));
  assert.equal(partial.events.length, 1); assert.equal(partial.warnings.length, LEAGUES.length - 1);
  await assert.rejects(() => getTodaySchedule('UTC', now, async () => { throw new Error('offline'); }), /unavailable/);
  await assert.rejects(() => getTodaySchedule('UTC', now, async () => Response.json({ wrong: [] })), /unavailable/);
});
test('sports route rejects invalid timezones and returns an explicit 502 on provider failure', async () => {
  assert.equal((await GET(new Request('http://localhost/api/sports?timezone=invalid'))).status, 400);
  const original = globalThis.fetch;
  try { globalThis.fetch = async () => new Response('', { status: 503 }); const response = await GET(new Request('http://localhost/api/sports?timezone=UTC')); assert.equal(response.status, 502); const data = await response.json(); assert.match(data.error, /No example games/); assert.equal(data.events, undefined); }
  finally { globalThis.fetch = original; }
});
