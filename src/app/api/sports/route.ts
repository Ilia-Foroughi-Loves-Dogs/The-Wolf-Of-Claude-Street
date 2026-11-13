import { getTodaySchedule } from '@/lib/sports-provider';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const timeZone = new URL(request.url).searchParams.get('timezone') || 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); }
  catch { return Response.json({ error: 'Use a valid IANA timezone.' }, { status: 400 }); }
  try {
    return Response.json(await getTodaySchedule(timeZone), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Sports schedules are unavailable. Please try again shortly. No example games have been substituted.' }, { status: 502 });
  }
}
