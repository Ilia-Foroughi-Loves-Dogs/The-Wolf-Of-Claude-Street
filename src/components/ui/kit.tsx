import type { ReactNode } from 'react';
import { Leaf, type LucideIcon } from 'lucide-react';

export type Tone = 'green' | 'gold' | 'blue' | 'purple' | 'neutral' | 'amber' | 'red';
export function Pill({ children, tone = 'green' }: { children: ReactNode; tone?: Tone }) { return <span className={`pill pill-${tone}`}>{children}</span>; }
export function IconTile({ icon: Icon, tone = 'green' }: { icon: LucideIcon; tone?: string }) { return <span className={`icon-tile tile-${tone}`}><Icon size={19} strokeWidth={1.7} /></span>; }
export function PanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) { return <div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>; }
export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="page-actions">{children}</div></div>; }
export function Empty({ title, description, icon: Icon = Leaf }: { title: string; description: string; icon?: LucideIcon }) { return <div className="empty"><Icon size={28} /><h3>{title}</h3><p>{description}</p></div>; }
export function Metric({ title, value, icon, tone = 'green', detail }: { title: string; value: string; icon: LucideIcon; tone?: string; detail: ReactNode }) { return <section className={`metric-card metric-${tone}`}><div className="metric-top"><span>{title}</span><IconTile icon={icon} tone={tone} /></div><strong className="metric-value">{value}</strong><div className="metric-detail">{detail}</div></section>; }

export function WolfMark({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M10 6 25 22h14L54 6l-2 26-20 26L12 32Z" fill="currentColor" /><path d="m21 33 7 3m15-3-7 3" stroke="#0b1020" strokeWidth="4" strokeLinecap="round" /><path d="m28 47 4 3 4-3" stroke="#0b1020" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export const signedMoney = (cents: number, format: (c: number) => string) => `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${format(Math.abs(cents))}`;
export const signedPercent = (value: number, digits = 2) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}%`;
