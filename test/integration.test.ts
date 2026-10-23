// The guestbook against the real filter API, in the integration step of a
// ticket: with FILTER_URL set to the filter API running beside the tests, a
// flagged entry is held and a clean one is shown. Without FILTER_URL these
// tests skip: the fake filter (consumer.test.ts) covers the guestbook alone.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/server.ts';
import { createFilter } from '../src/filter.ts';
import { parseFilterUrl } from '../src/config.ts';
import { testDatabase, type TestDatabase } from './helpers/db.ts';

const rawFilterUrl = process.env.FILTER_URL?.trim();
const filterUrl = rawFilterUrl ? parseFilterUrl(rawFilterUrl) : undefined;
const skip = filterUrl ? false : 'FILTER_URL is unset: no filter API to integrate with';

// The flagged text holds words the filter API's list is expected to have
// (the fake filter's): if it has none of them, the first test says so.
const FLAGGED = 'Cheap spam, no scam';
const CLEAN = 'Lovely guestbook';

async function check(text: string): Promise<unknown> {
  const response = await fetch(`${filterUrl}/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  return response.json();
}

const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
  redirect: 'manual',
});

let db: TestDatabase | undefined;
let server: Server | undefined;
let base = '';

before(async () => {
  if (!filterUrl) return;
  db = await testDatabase();
  server = createApp(db.store, { filter: createFilter(filterUrl) });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
  await db?.drop();
});

test('the filter API answers severity: review for a flagged text, none for a clean one', { skip }, async () => {
  const flagged = (await check(FLAGGED)) as { ok: boolean; words: string[]; severity: string };
  assert.equal(flagged.ok, false);
  assert.ok(flagged.words.length > 0);
  assert.equal(flagged.severity, 'review');
  assert.deepEqual(await check(CLEAN), { ok: true, words: [], severity: 'none' });
});

test('with the filter API, a flagged entry is held: 202, the visitor told, off the page', { skip }, async () => {
  const { words } = (await check(`Mallory\n${FLAGGED}`)) as { words: string[] };
  const response = await fetch(`${base}/entries`, form({ name: 'Mallory', message: FLAGGED }));
  assert.equal(response.status, 202);
  assert.match(await response.text(), /<p role="status">Your entry waits for review: the filter flagged /);
  assert.doesNotMatch(await (await fetch(`${base}/`)).text(), /Cheap spam/);
  const held = (await db!.store.listHeld()).at(0);
  assert.equal(held?.message, FLAGGED);
  assert.deepEqual(held?.heldWords, words);
});

test('with the filter API, a clean entry is stored and shown', { skip }, async () => {
  const response = await fetch(`${base}/entries`, form({ name: 'Grace', message: CLEAN }));
  assert.equal(response.status, 303);
  assert.match(await (await fetch(`${base}/`)).text(), /Lovely guestbook/);
  assert.equal((await db!.store.list()).at(0)?.message, CLEAN);
});
