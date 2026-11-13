import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AccountProvider } from '@/components/account-provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = { title: 'Wolf of Claude Street', description: 'Round up your purchases, save the change, and invest it in the S&P 500 and other funds. A practice app with real market prices and pretend money.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={inter.variable}><body><AccountProvider>{children}</AccountProvider></body></html>;
}
