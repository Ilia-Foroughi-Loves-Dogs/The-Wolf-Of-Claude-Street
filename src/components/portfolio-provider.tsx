"use client";
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { emptyPortfolio, loadPortfolio, type Portfolio, type Scenario } from '@/lib/engine';
type Context={state:Portfolio;ready:boolean;storageError:string;activeScenario:Scenario|undefined;setActiveScenario:React.Dispatch<React.SetStateAction<Scenario|undefined>>;mutate:(fn:(s:Portfolio)=>Portfolio,options?:{replace:boolean})=>Promise<void>};
const PortfolioContext=createContext<Context|null>(null);
// Each account keeps its own portfolio under its own storage key.
export function PortfolioProvider({storageKey,children}:{storageKey:string;children:React.ReactNode}){
  const [state,setState]=useState<Portfolio>(emptyPortfolio),[ready,setReady]=useState(false),[storageError,setStorageError]=useState('');
  const [activeScenario,setActiveScenario]=useState<Scenario|undefined>();
  useEffect(()=>{
    try{const raw=localStorage.getItem(storageKey);const initial=raw?loadPortfolio(raw):emptyPortfolio();if(!raw)localStorage.setItem(storageKey,JSON.stringify(initial));setState(initial);setStorageError('');}
    catch{setStorageError('Your saved data could not be read. It has been kept as-is. Use “Start over” in Settings to recover.');}
    setReady(true);
    const sync=(e:StorageEvent)=>{if(e.key===storageKey&&e.newValue){try{setState(loadPortfolio(e.newValue));}catch{setStorageError('Another tab saved invalid data. Reload the page or start over in Settings.');}}};
    window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  },[storageKey]);
  const mutate=useCallback(async(fn:(s:Portfolio)=>Portfolio,options?:{replace:boolean})=>{
    const commit=()=>{let current:Portfolio;if(options?.replace)current=emptyPortfolio();else{try{const raw=localStorage.getItem(storageKey);current=raw?loadPortfolio(raw):emptyPortfolio();}catch{throw new Error('Your saved data is unavailable. Use “Start over” in Settings to recover.');}}const next=loadPortfolio(JSON.stringify(fn(current)));localStorage.setItem(storageKey,JSON.stringify(next));setState(next);setStorageError('');};
    try{if(navigator.locks)await navigator.locks.request(`wocs-write:${storageKey}`,commit);else commit();}
    catch(e){throw e instanceof Error?e:new Error('Unable to save. Browser storage may be full or disabled.');}
  },[storageKey]);
  return <PortfolioContext.Provider value={{state,ready,storageError,mutate,activeScenario,setActiveScenario}}>{children}</PortfolioContext.Provider>;
}
export function usePortfolio(){const value=useContext(PortfolioContext);if(!value)throw new Error('Missing portfolio provider');return value;}
