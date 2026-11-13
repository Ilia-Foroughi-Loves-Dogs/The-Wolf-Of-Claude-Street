import { getMarketSnapshot } from '@/lib/market-provider';

export const runtime = 'nodejs';
export async function GET() {
  try {
    return Response.json(await getMarketSnapshot(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Market prices are unavailable right now. Trading is paused until prices load.' }, { status: 502 });
  }
}
