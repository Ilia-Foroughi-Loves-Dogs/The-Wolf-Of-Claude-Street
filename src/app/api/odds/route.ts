import { getOddsBoard } from '@/lib/odds-provider';

export const runtime = 'nodejs';
export async function GET() {
  try {
    return Response.json(await getOddsBoard(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Prediction market odds are unavailable right now. Please try again shortly.' }, { status: 502 });
  }
}
