import type { Metadata } from 'next';
import { PortfolioProvider } from '@/components/portfolio-provider';
import './globals.css';
export const metadata:Metadata={title:'RoundUp AI — Small change. Real momentum.',description:'Turn everyday purchases into protected savings. Explore probability with a separate virtual budget. An educational fintech simulation.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="dark"><body><PortfolioProvider>{children}</PortfolioProvider></body></html>;}
