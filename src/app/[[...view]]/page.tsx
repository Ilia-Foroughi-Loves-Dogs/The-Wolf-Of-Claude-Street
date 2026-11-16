import { notFound, redirect } from 'next/navigation';
import { Application } from '@/components/application';
const VIEWS = ['dashboard', 'invest', 'activity', 'simulator', 'advisor', 'settings'];
const MOVED: Record<string, string> = { transactions: '/activity', savings: '/' };
export default async function Page({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view } = await params;
  const selected = view?.[0] ?? 'dashboard';
  if ((view?.length ?? 0) === 1 && MOVED[selected]) redirect(MOVED[selected]);
  if ((view?.length ?? 0) > 1 || !VIEWS.includes(selected)) notFound();
  return <Application view={selected} />;
}
