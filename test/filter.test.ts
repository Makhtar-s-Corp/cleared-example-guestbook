import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createFilter, FilterError } from '../src/filter.ts';
import { fakeFilter } from './helpers/fake-filter.ts';

test('check posts the text as JSON to /check and gives back the verdict', async () => {
  const fake = await fakeFilter();
  try {
    const filter = createFilter(fake.url);
    assert.deepEqual(await filter.check('Lovely guestbook'), { ok: true, words: [], severity: 'none' });
    assert.deepEqual(await filter.check('Some spam, a scam'), { ok: false, words: ['spam', 'scam'], severity: 'review' });
    assert.deepEqual(fake.calls, ['Lovely guestbook', 'Some spam, a scam']);
  } finally {
    await fake.close();
  }
});

test('an answer without severity, from a filter API older than it, is a FilterError', async () => {
  const fake = await fakeFilter();
  try {
    fake.answer = 'old-contract';
    const filter = createFilter(fake.url);
    await assert.rejects(filter.check('Lovely guestbook'), FilterError);
    await assert.rejects(filter.check('Some spam'), FilterError);
  } finally {
    await fake.close();
  }
});

test('a severity that disagrees with ok is a FilterError', async () => {
  const fake = await fakeFilter();
  try {
    const filter = createFilter(fake.url);
    for (const answer of ['{"ok":true,"words":[],"severity":"review"}', '{"ok":false,"words":["scam"],"severity":"none"}']) {
      fake.answer = answer;
      await assert.rejects(filter.check('text'), FilterError, answer);
    }
  } finally {
    await fake.close();
  }
});

test('an answer that is not 200, or not the contract\'s shape, is a FilterError', async () => {
  const fake = await fakeFilter();
  try {
    const filter = createFilter(fake.url);
    for (const answer of [500, 404, 'not json', '{"ok":true}', '{"ok":"yes","words":[]}', '{"ok":false,"words":[3]}', '[]', '{"ok":false,"words":[],"severity":"high"}', '{"ok":true,"words":[],"severity":null}']) {
      fake.answer = answer;
      await assert.rejects(filter.check('text'), FilterError, String(answer));
    }
  } finally {
    await fake.close();
  }
});

test('a filter that does not listen is a FilterError, at once', async () => {
  const fake = await fakeFilter();
  const url = fake.url;
  await fake.close();
  await assert.rejects(createFilter(url).check('text'), FilterError);
});

test('a filter that does not answer in time is a FilterError after the timeout, not a hang', async () => {
  const silent = createServer(() => {});
  await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
  try {
    const started = Date.now();
    await assert.rejects(createFilter(`http://127.0.0.1:${(silent.address() as AddressInfo).port}`, { timeoutMs: 300 }).check('text'), FilterError);
    assert.ok(Date.now() - started < 2000, 'the timeout holds');
  } finally {
    silent.closeAllConnections();
    await new Promise<void>((resolve) => silent.close(() => resolve()));
  }
});
