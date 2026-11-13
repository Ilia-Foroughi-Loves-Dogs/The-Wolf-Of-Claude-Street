"use client";
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SESSION_KEY, createAccount, deleteAccount, portfolioKey, publicAccount, readAccounts, renameAccount, verifyLogin, type PublicAccount } from '@/lib/accounts';
import { STORAGE_KEY, demoPortfolio, emptyPortfolio, loadPortfolio } from '@/lib/engine';
import { MarketProvider } from './market-provider';
import { PortfolioProvider } from './portfolio-provider';
import { AuthScreen } from './auth-screen';

export type StartWith = 'sample' | 'blank' | 'existing';
type Context = { account: PublicAccount; logOut: () => void; rename: (name: string) => void; remove: () => void };
const AccountContext = createContext<Context | null>(null);

export type AuthActions = { signUp: (input: { name: string; email: string; password: string; startWith: StartWith }) => Promise<void>; logIn: (email: string, password: string) => Promise<void>; hasDeviceData: boolean };

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<PublicAccount | null>(null), [ready, setReady] = useState(false), [hasDeviceData, setHasDeviceData] = useState(false);
  useEffect(() => {
    try {
      const id = localStorage.getItem(SESSION_KEY), found = readAccounts().find(a => a.id === id);
      setAccount(found ? publicAccount(found) : null);
      setHasDeviceData(!!localStorage.getItem(STORAGE_KEY));
    } catch { /* storage unavailable: show the sign-up screen */ }
    setReady(true);
  }, []);

  const signUp = useCallback<AuthActions['signUp']>(async ({ startWith, ...input }) => {
    const created = await createAccount(input);
    let initial = startWith === 'sample' ? demoPortfolio() : emptyPortfolio();
    if (startWith === 'existing') { try { initial = loadPortfolio(localStorage.getItem(STORAGE_KEY) ?? ''); } catch { initial = emptyPortfolio(); } }
    localStorage.setItem(portfolioKey(created.id), JSON.stringify(initial));
    if (startWith === 'existing') localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(SESSION_KEY, created.id);
    setAccount(publicAccount(created));
  }, []);
  const logIn = useCallback<AuthActions['logIn']>(async (email, password) => {
    const found = await verifyLogin(email, password);
    localStorage.setItem(SESSION_KEY, found.id);
    setAccount(publicAccount(found));
  }, []);
  const logOut = useCallback(() => { localStorage.removeItem(SESSION_KEY); setAccount(null); setHasDeviceData(!!localStorage.getItem(STORAGE_KEY)); }, []);
  const rename = useCallback((name: string) => { if (!account) return; renameAccount(account.id, name); setAccount({ ...account, name: name.trim() }); }, [account]);
  const remove = useCallback(() => { if (!account) return; deleteAccount(account.id); setAccount(null); }, [account]);

  if (!ready) return <div className="boot" aria-busy="true" />;
  if (!account) return <AuthScreen signUp={signUp} logIn={logIn} hasDeviceData={hasDeviceData} />;
  return <AccountContext.Provider value={{ account, logOut, rename, remove }}>
    <PortfolioProvider key={account.id} storageKey={portfolioKey(account.id)}><MarketProvider>{children}</MarketProvider></PortfolioProvider>
  </AccountContext.Provider>;
}
export function useAccount() { const value = useContext(AccountContext); if (!value) throw new Error('Missing account provider'); return value; }
