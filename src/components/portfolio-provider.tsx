"use client";
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { STORAGE_KEY, demoPortfolio, emptyPortfolio, loadPortfolio, type Portfolio, type Scenario } from '@/lib/engine';
type Context={state:Portfolio;ready:boolean;storageError:string;activeScenario:Scenario|undefined;setActiveScenario:React.Dispatch<React.SetStateAction<Scenario|undefined>>;mutate:(fn:(s:Portfolio)=>Portfolio,options?:{replace:boolean})=>Promise<void>};
const PortfolioContext=createContext<Context|null>(null);
export function PortfolioProvider({children}:{children:React.ReactNode}){
  const [state,setState]=useState<Portfolio>(emptyPortfolio),[ready,setReady]=useState(false),[storageError,setStorageError]=useState('');
  const [activeScenario,setActiveScenario]=useState<Scenario|undefined>();
  useEffect(()=>{
    try{const raw=localStorage.getItem(STORAGE_KEY);const initial=raw?loadPortfolio(raw):demoPortfolio();if(!raw)localStorage.setItem(STORAGE_KEY,JSON.stringify(initial));setState(initial);setStorageError('');}
    catch{setStorageError('Saved data could not be read. Your stored copy has been preserved. Reset or load the demo to recover.');}
    setReady(true);
    const sync=(e:StorageEvent)=>{if(e.key===STORAGE_KEY&&e.newValue){try{setState(loadPortfolio(e.newValue));}catch{setStorageError('Another tab saved invalid data. Reload or reset the demo to recover.');}}};
    window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  },[]);
  const mutate=useCallback(async(fn:(s:Portfolio)=>Portfolio,options?:{replace:boolean})=>{
    const commit=()=>{let current:Portfolio;if(options?.replace)current=emptyPortfolio();else{try{const raw=localStorage.getItem(STORAGE_KEY);current=raw?loadPortfolio(raw):emptyPortfolio();}catch{throw new Error('Saved data is unavailable or invalid. The stored copy has been preserved. Use Reset demo or Load Demo Portfolio to recover.');}}const next=loadPortfolio(JSON.stringify(fn(current)));localStorage.setItem(STORAGE_KEY,JSON.stringify(next));setState(next);setStorageError('');};
    try{if(navigator.locks)await navigator.locks.request('roundup-portfolio-write',commit);else commit();}
    catch(e){throw e instanceof Error?e:new Error('Unable to save. Browser storage may be full or disabled.');}
  },[]);
  return <PortfolioContext.Provider value={{state,ready,storageError,mutate,activeScenario,setActiveScenario}}>{children}</PortfolioContext.Provider>;
}
export function usePortfolio(){const value=useContext(PortfolioContext);if(!value)throw new Error('Missing portfolio provider');return value;}
