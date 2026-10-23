import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { createStore } from '../src/store.ts';
import { databaseUrl, testDatabase, type TestDatabase } from './helpers/db.ts';

let db: TestDatabase;

before(async () => {
  db = await testDatabase();
});

after(async () => {
  await db.drop();
});

test('init can run again on an existing table', async () => {
  await db.store.init();
  await db.store.init();
});

test('add returns the stored entry with its id and time', async () => {
  const entry = await db.store.add('Ada', 'Hello from the test');
  assert.equal(typeof entry.id, 'number');
  assert.equal(entry.name, 'Ada');
  assert.equal(entry.message, 'Hello from the test');
  assert.ok(entry.createdAt instanceof Date);
});

test('list gives the entries newest first', async () => {
  const fresh = await testDatabase();
  try {
    for (const name of ['first', 'second', 'third']) await fresh.store.add(name, `entry ${name}`);
    const names = (await fresh.store.list()).map((entry) => entry.name);
    assert.deepEqual(names, ['third', 'second', 'first']);
  } finally {
    await fresh.drop();
  }
});

test('a held entry is stored with its words and left out of the list', async () => {
  const fresh = await testDatabase();
  try {
    await fresh.store.add('Ada', 'shown');
    const held = await fresh.store.add('Mallory', 'Cheap spam, no scam', ['spam', 'scam']);
    assert.deepEqual((await fresh.store.list()).map((entry) => entry.message), ['shown']);
    const heldEntries = await fresh.store.listHeld();
    assert.equal(heldEntries.length, 1);
    assert.equal(heldEntries[0]?.id, held.id);
    assert.equal(heldEntries[0]?.message, 'Cheap spam, no scam');
    assert.deepEqual(heldEntries[0]?.heldWords, ['spam', 'scam']);
  } finally {
    await fresh.drop();
  }
});

test('init adds the held columns to a table made before them, keeping its entries shown', async () => {
  const fresh = await testDatabase();
  try {
    const raw = new Client({ connectionString: databaseUrl() });
    await raw.connect();
    try {
      await raw.query(`SET search_path TO ${fresh.schema}`);
      await raw.query('DROP TABLE entries');
      await raw.query('CREATE TABLE entries (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())');
      await raw.query("INSERT INTO entries (name, message) VALUES ('Ada', 'from before')");
    } finally {
      await raw.end();
    }
    await fresh.store.init();
    assert.deepEqual((await fresh.store.list()).map((entry) => entry.message), ['from before']);
    assert.deepEqual(await fresh.store.listHeld(), []);
  } finally {
    await fresh.drop();
  }
});

test('ping is true while the database answers', async () => {
  assert.equal(await db.store.ping(), true);
});

test('ping is false, quickly, when nothing listens at the address', async () => {
  // Port 1 on loopback: nothing listens there, the connection is refused.
  const down = createStore('postgres://postgres@127.0.0.1:1/postgres', { timeoutMs: 1000 });
  const started = Date.now();
  try {
    assert.equal(await down.ping(), false);
    assert.ok(Date.now() - started < 3000, 'ping must not hang');
  } finally {
    await down.close();
  }
});
