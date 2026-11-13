import assert from 'node:assert/strict';
import { getTodaySchedule } from '../src/lib/sports-provider';
import { localDate, SPORTS } from '../src/lib/sports';

async function main() {
const timeZone = process.env.SPORTS_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
const now = new Date();
const schedule = await getTodaySchedule(timeZone, now);
assert.equal(schedule.date, localDate(now,timeZone));
for (const event of schedule.events) {
  assert.equal(localDate(event.startsAt,timeZone),schedule.date);
  assert.equal(event.teams.length,2); assert(event.teams.every(team=>team.name.length>0));
}
console.log(JSON.stringify({ source:schedule.source, date:schedule.date, timeZone, fetchedAt:schedule.fetchedAt,
  counts:Object.fromEntries(SPORTS.map(sport=>[sport,schedule.events.filter(game=>game.sport===sport).length])),
  warnings:schedule.warnings, sample:schedule.events.slice(0,5).map(game=>({name:game.name,league:game.league,startsAt:game.startsAt,localTime:new Date(game.startsAt).toLocaleString('en-US',{timeZone}),status:game.status})),
},null,2));
assert(schedule.events.length>0,'Live verification returned no events. Empty schedules are supported, but real events were not verified.');

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
