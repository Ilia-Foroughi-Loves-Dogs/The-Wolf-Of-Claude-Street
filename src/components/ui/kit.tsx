import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <header className="page-title"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children && <div className="page-title-actions">{children}</div>}</header>;
}
export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{(title || action) && <div className="card-head">{title && <h2>{title}</h2>}{action}</div>}{children}</section>;
}
export function Empty({ title, description, icon: Icon = Inbox, children }: { title: string; description: string; icon?: LucideIcon; children?: ReactNode }) {
  return <div className="empty-state"><Icon size={26} strokeWidth={1.6} /><strong>{title}</strong><p>{description}</p>{children}</div>;
}
export function WolfMark({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M10 6 25 22h14L54 6l-2 26-20 26L12 32Z" fill="currentColor" /><path d="m21 33 7 3m15-3-7 3" stroke="var(--logo-cut, #fff)" strokeWidth="4" strokeLinecap="round" /><path d="m28 47 4 3 4-3" stroke="var(--logo-cut, #fff)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
export const signedMoney = (cents: number, format: (c: number) => string) => `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${format(Math.abs(cents))}`;
export const signedPercent = (value: number, digits = 2) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}%`;
