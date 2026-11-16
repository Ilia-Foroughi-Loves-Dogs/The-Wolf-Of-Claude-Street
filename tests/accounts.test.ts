import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCOUNTS_KEY, SESSION_KEY, createAccount, deleteAccount, portfolioKey, readAccounts, renameAccount, validateSignUp, verifyLogin } from '../src/lib/accounts';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

test('sign-up validation gives plain messages', () => {
  assert.equal(validateSignUp({ name: '', email: 'a@b.co', password: 'longenough' }), 'Enter your name.');
  assert.equal(validateSignUp({ name: 'Al', email: 'nope', password: 'longenough' }), 'Enter a valid email address.');
  assert.equal(validateSignUp({ name: 'Al', email: 'a@b.co', password: 'short' }), 'Use a password with at least 8 characters.');
  assert.equal(validateSignUp({ name: 'Al', email: 'a@b.co', password: 'longenough' }), null);
});

test('accounts store a salted hash, never the password, and log in case-insensitively', async () => {
  const storage = new MemoryStorage();
  const account = await createAccount({ name: ' Alex ', email: 'Alex@Example.com ', password: 'correct horse' }, storage);
  assert.equal(account.name, 'Alex');
  assert.equal(account.email, 'alex@example.com');
  assert(!storage.getItem(ACCOUNTS_KEY)!.includes('correct horse'));
  assert.match(account.hash, /^[0-9a-f]{64}$/);
  const second = await createAccount({ name: 'Sam', email: 'sam@example.com', password: 'correct horse' }, storage);
  assert.notEqual(second.hash, account.hash, 'salts differ');
  assert.equal((await verifyLogin('ALEX@example.com', 'correct horse', storage)).id, account.id);
  await assert.rejects(verifyLogin('alex@example.com', 'wrong password', storage), /don’t match/);
  await assert.rejects(verifyLogin('nobody@example.com', 'correct horse', storage), /don’t match/);
  await assert.rejects(createAccount({ name: 'Dup', email: 'alex@example.com', password: 'another one' }, storage), /already exists/);
});

test('renaming and deleting an account also removes its data and session', async () => {
  const storage = new MemoryStorage();
  const account = await createAccount({ name: 'Alex', email: 'alex@example.com', password: 'password1' }, storage);
  storage.setItem(portfolioKey(account.id), '{}'); storage.setItem(SESSION_KEY, account.id);
  renameAccount(account.id, 'Alex Morgan', storage);
  assert.equal(readAccounts(storage)[0].name, 'Alex Morgan');
  assert.throws(() => renameAccount(account.id, '   ', storage), /name/);
  deleteAccount(account.id, storage);
  assert.deepEqual(readAccounts(storage), []);
  assert.equal(storage.getItem(portfolioKey(account.id)), null);
  assert.equal(storage.getItem(SESSION_KEY), null);
});

test('corrupt account storage reads as empty instead of crashing', () => {
  const storage = new MemoryStorage();
  storage.setItem(ACCOUNTS_KEY, '{not json');
  assert.deepEqual(readAccounts(storage), []);
});
