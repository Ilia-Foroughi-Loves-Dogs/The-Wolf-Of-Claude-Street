import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { MarketProvider } from '@/components/market-provider';
import { PortfolioProvider } from '@/components/portfolio-provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const display = Playfair_Display({ subsets: ['latin'], variable: '--font-display', weight: ['600', '700'] });

export const metadata: Metadata = { title: 'Wolf of Claude Street — Small change. Serious ambition.', description: 'Turn everyday purchases into savings, put them to work in simulated S&P 500 and stock investments, and explore probability with a separate virtual budget. An educational fintech simulation.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`dark ${inter.variable} ${display.variable}`}><body><PortfolioProvider><MarketProvider>{children}</MarketProvider></PortfolioProvider></body></html>;
}
