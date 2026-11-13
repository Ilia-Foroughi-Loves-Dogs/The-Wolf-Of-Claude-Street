import { notFound } from 'next/navigation';
import { Application } from '@/components/application';
export default async function Page({params}:{params:Promise<{view?:string[]}>}){const {view}=await params;const selected=view?.[0]??'dashboard';if((view?.length??0)>1||!['dashboard','transactions','savings','simulator','advisor','settings'].includes(selected))notFound();return <Application view={selected}/>;}
