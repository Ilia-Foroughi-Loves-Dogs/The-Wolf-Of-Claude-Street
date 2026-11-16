export type MarketKind = 'index' | 'stock';
export type MarketInfo = { symbol: string; name: string; kind: MarketKind; blurb: string };
export type Quote = MarketInfo & {
  price: number;
  previousClose: number;
  changePercent: number;
  yearChangePercent: number | null;
  history: number[];
  asOf: string;
};
export type MarketSnapshot = { quotes: Quote[]; fetchedAt: string; source: string; missing: string[] };

// A fixed list keeps the server from fetching user-controlled symbols.
export const MARKETS: MarketInfo[] = [
  { symbol: 'SPY', name: 'S&P 500 ETF', kind: 'index', blurb: '500 of the largest US companies' },
  { symbol: 'QQQ', name: 'Nasdaq-100 ETF', kind: 'index', blurb: '100 largest non-financial Nasdaq companies' },
  { symbol: 'DIA', name: 'Dow Jones ETF', kind: 'index', blurb: '30 blue-chip US companies' },
  { symbol: 'VTI', name: 'Total US Market ETF', kind: 'index', blurb: 'Nearly every US-listed stock' },
  { symbol: 'VXUS', name: 'International ETF', kind: 'index', blurb: 'Developed and emerging markets outside the US' },
  { symbol: 'BND', name: 'Total Bond ETF', kind: 'index', blurb: 'US investment-grade bonds, lower volatility' },
  { symbol: 'GLD', name: 'Gold ETF', kind: 'index', blurb: 'Tracks the price of gold' },
  { symbol: 'AAPL', name: 'Apple', kind: 'stock', blurb: 'iPhone, Mac and services' },
  { symbol: 'MSFT', name: 'Microsoft', kind: 'stock', blurb: 'Cloud, Windows and Office' },
  { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock', blurb: 'AI and graphics chips' },
  { symbol: 'AMZN', name: 'Amazon', kind: 'stock', blurb: 'E-commerce and AWS cloud' },
  { symbol: 'GOOGL', name: 'Alphabet', kind: 'stock', blurb: 'Google search, YouTube and cloud' },
  { symbol: 'META', name: 'Meta Platforms', kind: 'stock', blurb: 'Facebook, Instagram and WhatsApp' },
  { symbol: 'TSLA', name: 'Tesla', kind: 'stock', blurb: 'Electric vehicles and energy' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway', kind: 'stock', blurb: 'Warren Buffett’s conglomerate' },
  { symbol: 'JPM', name: 'JPMorgan Chase', kind: 'stock', blurb: 'Largest US bank' },
  { symbol: 'KO', name: 'Coca-Cola', kind: 'stock', blurb: 'Beverages and steady dividends' },
];
export const marketInfo = (symbol: string) => MARKETS.find(m => m.symbol === symbol);

// Ready-made auto-invest mixes. Weights always add to 100.
export const STRATEGIES = [
  { key: 'steady', name: 'Steady Pack', description: 'Broad market with a bond cushion.', mix: [{ symbol: 'SPY', weight: 60 }, { symbol: 'BND', weight: 25 }, { symbol: 'VXUS', weight: 15 }] },
  { key: 'classic', name: 'The Classic', description: 'All-in on the S&P 500.', mix: [{ symbol: 'SPY', weight: 100 }] },
  { key: 'balanced', name: 'Balanced Pack', description: 'US market, tech tilt, a little global.', mix: [{ symbol: 'SPY', weight: 50 }, { symbol: 'QQQ', weight: 30 }, { symbol: 'VXUS', weight: 20 }] },
  { key: 'alpha', name: 'Go-Getter', description: 'Growth-heavy: tech index plus big names.', mix: [{ symbol: 'QQQ', weight: 40 }, { symbol: 'SPY', weight: 30 }, { symbol: 'NVDA', weight: 15 }, { symbol: 'MSFT', weight: 15 }] },
] as const;

// Illustrative long-run annual return assumptions for the growth calculator.
export const RETURN_ASSUMPTIONS = [
  { key: 'bonds', label: 'Bonds', rate: 0.04, note: 'Roughly the long-run US bond average' },
  { key: 'balanced', label: 'Balanced', rate: 0.07, note: 'A blend of stocks and bonds' },
  { key: 'sp500', label: 'S&P 500 history', rate: 0.10, note: 'Approximate long-run S&P 500 average with dividends' },
] as const;

export function growthProjection(startCents: number, monthlyCents: number, years: number, annualRate: number) {
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  let value = startCents, contributed = startCents;
  const points = [{ year: 0, contributed: contributed / 100, value: value / 100 }];
  for (let month = 1; month <= years * 12; month++) {
    value = value * (1 + monthlyRate) + monthlyCents;
    contributed += monthlyCents;
    if (month % 12 === 0) points.push({ year: month / 12, contributed: Math.round(contributed) / 100, value: Math.round(value) / 100 });
  }
  return points;
}
