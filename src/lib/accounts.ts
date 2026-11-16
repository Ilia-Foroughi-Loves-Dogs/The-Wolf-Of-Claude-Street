import { z } from 'zod';
import { STORAGE_KEY } from './engine';

// Accounts live in this browser only (there is no server). Passwords are never
// stored: only a salted PBKDF2-SHA256 hash is kept.
export const ACCOUNTS_KEY = 'wocs-accounts-v1';
export const SESSION_KEY = 'wocs-session-v1';
export const portfolioKey = (accountId: string) => `${STORAGE_KEY}:${accountId}`;

const accountSchema = z.object({ id: z.string(), name: z.string().min(1).max(60), email: z.string().max(200), salt: z.string(), hash: z.string(), createdAt: z.string() });
export type Account = z.infer<typeof accountSchema>;
export type PublicAccount = Omit<Account, 'salt' | 'hash'>;
export const publicAccount = ({ salt: _salt, hash: _hash, ...rest }: Account): PublicAccount => rest;

const ITERATIONS = 150_000;
const toHex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map(h => parseInt(h, 16)));
export async function hashPassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITERATIONS }, key, 256);
  return toHex(bits);
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export function validateSignUp(input: { name: string; email: string; password: string }) {
  if (!input.name.trim()) return 'Enter your name.';
  if (input.name.trim().length > 60) return 'Use a name under 60 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Enter a valid email address.';
  if (input.password.length < 8) return 'Use a password with at least 8 characters.';
  return null;
}

export function readAccounts(storage: Storage = localStorage): Account[] {
  try { return z.array(accountSchema).parse(JSON.parse(storage.getItem(ACCOUNTS_KEY) ?? '[]')); } catch { return []; }
}
function writeAccounts(accounts: Account[], storage: Storage) { storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)); }

export async function createAccount(input: { name: string; email: string; password: string }, storage: Storage = localStorage): Promise<Account> {
  const error = validateSignUp(input);
  if (error) throw new Error(error);
  const accounts = readAccounts(storage), email = normalizeEmail(input.email);
  if (accounts.some(a => a.email === email)) throw new Error('An account with this email already exists on this device. Log in instead.');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const account: Account = { id: crypto.randomUUID(), name: input.name.trim(), email, salt, hash: await hashPassword(input.password, salt), createdAt: new Date().toISOString() };
  writeAccounts([...accounts, account], storage);
  return account;
}

export async function verifyLogin(emailInput: string, password: string, storage: Storage = localStorage): Promise<Account> {
  const account = readAccounts(storage).find(a => a.email === normalizeEmail(emailInput));
  // Hash even when the email is unknown so both failures take similar time.
  const hash = await hashPassword(password, account?.salt ?? '00'.repeat(16));
  if (!account || hash !== account.hash) throw new Error('That email and password don’t match an account on this device.');
  return account;
}

export function renameAccount(id: string, name: string, storage: Storage = localStorage) {
  if (!name.trim() || name.trim().length > 60) throw new Error('Enter a name under 60 characters.');
  writeAccounts(readAccounts(storage).map(a => a.id === id ? { ...a, name: name.trim() } : a), storage);
}
export function deleteAccount(id: string, storage: Storage = localStorage) {
  writeAccounts(readAccounts(storage).filter(a => a.id !== id), storage);
  storage.removeItem(portfolioKey(id));
  if (storage.getItem(SESSION_KEY) === id) storage.removeItem(SESSION_KEY);
}
