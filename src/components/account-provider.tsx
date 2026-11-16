"use client";
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SESSION_KEY, portfolioKey, readAccounts } from '@/lib/accounts';
import { STORAGE_KEY, demoPortfolio } from '@/lib/engine';
import { MarketProvider } from './market-provider';
import { PortfolioProvider } from './portfolio-provider';

// No sign-up: everyone uses the app directly. A display name is optional.
// Data created under an earlier device-local account is still used if present.
const PROFILE_KEY = 'wocs-profile-v1';
type Context = { name: string; rename: (name: string) => void };
const ProfileContext = createContext<Context | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [storageKey, setStorageKey] = useState<string | null>(null), [name, setName] = useState('');
  useEffect(() => {
    let key = STORAGE_KEY, initialName = '';
    try {
      const accounts = readAccounts(), previous = accounts.find(a => a.id === localStorage.getItem(SESSION_KEY)) ?? accounts[0];
      if (previous && localStorage.getItem(portfolioKey(previous.id))) { key = portfolioKey(previous.id); initialName = previous.name; }
      initialName = localStorage.getItem(PROFILE_KEY) ?? initialName;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(demoPortfolio()));
    } catch { /* storage unavailable: the portfolio provider reports it */ }
    setName(initialName); setStorageKey(key);
  }, []);
  const rename = useCallback((next: string) => {
    if (next.trim().length > 60) throw new Error('Use a name under 60 characters.');
    localStorage.setItem(PROFILE_KEY, next.trim()); setName(next.trim());
  }, []);
  if (!storageKey) return <div className="boot" aria-busy="true" />;
  return <ProfileContext.Provider value={{ name, rename }}>
    <PortfolioProvider storageKey={storageKey}><MarketProvider>{children}</MarketProvider></PortfolioProvider>
  </ProfileContext.Provider>;
}
export function useProfile() { const value = useContext(ProfileContext); if (!value) throw new Error('Missing profile provider'); return value; }
