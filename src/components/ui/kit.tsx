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
export function LogoMark({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="#f5b70a" /><circle cx="32" cy="32" r="21" stroke="#b7791f" strokeWidth="3" /><path d="M32 44V21m-9 9 9-9 9 9" stroke="#111827" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
export const signedMoney = (cents: number, format: (c: number) => string) => `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${format(Math.abs(cents))}`;
export const signedPercent = (value: number, digits = 2) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}%`;
