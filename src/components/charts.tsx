"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { activityData, money, type Portfolio } from '@/lib/engine';
export const chartColors = { savings: '#2563eb', invested: '#10b981', roundups: '#f59e0b', risk: '#8b5cf6', performance: '#f97316' };
const names: Record<string, string> = { savings: 'Savings', invested: 'Invested', roundups: 'Spare change', risk: 'Sports Lab', performance: 'Sports result' };
const tick = { fill: '#6b7280', fontSize: 12 };
const tooltip = { contentStyle: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: '#111827', boxShadow: '0 6px 20px #1118271a' }, labelStyle: { color: '#6b7280', marginBottom: 6 } };

export function ActivityChart({ state, days, visible }: { state: Portfolio; days: number; visible: Partial<Record<keyof typeof chartColors, boolean>> }) {
  const data = activityData(state, days);
  const keys = (Object.keys(chartColors) as (keyof typeof chartColors)[]).filter(key => visible[key]);
  return <div className="activity-chart" role="img" aria-label={`Your money over the last ${days} days`}><ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: -14 }}>
      <defs>{keys.map(key => <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColors[key]} stopOpacity={.15} /><stop offset="100%" stopColor={chartColors[key]} stopOpacity={0} /></linearGradient>)}</defs>
      <CartesianGrid vertical={false} stroke="#f0f1f3" />
      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={tick} minTickGap={40} dy={6} />
      <YAxis axisLine={false} tickLine={false} tick={tick} tickFormatter={v => `$${v}`} width={52} />
      <Tooltip {...tooltip} formatter={(value, name) => [money(Math.round(Number(value) * 100)), names[String(name)] ?? String(name)]} />
      {keys.map(key => <Area key={key} type="monotone" dataKey={key} stroke={chartColors[key]} strokeWidth={2} fill={`url(#fill-${key})`} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />)}
    </AreaChart>
  </ResponsiveContainer></div>;
}
export function GrowthChart({ data }: { data: { year: number; contributed: number; value: number }[] }) {
  return <div className="growth-chart" role="img" aria-label="Estimated growth compared with what you put in"><ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
      <CartesianGrid vertical={false} stroke="#f0f1f3" />
      <XAxis dataKey="year" axisLine={false} tickLine={false} tick={tick} tickFormatter={v => `Yr ${v}`} minTickGap={28} />
      <YAxis axisLine={false} tickLine={false} tick={tick} width={60} tickFormatter={v => v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`} />
      <Tooltip {...tooltip} labelFormatter={v => `Year ${v}`} formatter={(value, name) => [money(Math.round(Number(value) * 100)), name === 'value' ? 'Estimated value' : 'You put in']} />
      <Area type="monotone" dataKey="contributed" stroke="#9ca3af" strokeWidth={2} fill="#f3f4f6" isAnimationActive={false} />
      <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2.5} fill="#10b98122" isAnimationActive={false} />
    </AreaChart>
  </ResponsiveContainer></div>;
}
