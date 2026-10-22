import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, relativeTime, renderPage } from '../src/page.ts';
import type { Entry } from '../src/store.ts';

const at = new Date('2026-10-21T10:00:00Z');
const entry = (id: number, name: string, message: string): Entry => ({ id, name, message, createdAt: at });

test('escapeHtml escapes the five characters that matter in HTML', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('the page lists the entries in the order it is given, escaped', () => {
  const html = renderPage([entry(1, 'Ada', 'first'), entry(2, '<b>Bob</b>', 'x < y & "z"')]);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.indexOf('Ada') < html.indexOf('&lt;b&gt;Bob&lt;/b&gt;'));
  assert.ok(html.includes('x &lt; y &amp; &quot;z&quot;'));
  assert.ok(!html.includes('<b>Bob</b>'));
  assert.ok(html.includes('datetime="2026-10-21T10:00:00.000Z"'));
});

test('relativeTime says how long ago an entry was written', () => {
  const now = new Date('2026-10-22T09:30:00Z');
  const ago = (iso: string) => relativeTime(new Date(iso), now);
  assert.equal(ago('2026-10-22T09:29:30Z'), "à l'instant");
  assert.equal(ago('2026-10-22T09:31:00Z'), "à l'instant");
  assert.equal(ago('2026-10-22T09:27:00Z'), 'il y a 3 min');
  assert.equal(ago('2026-10-22T08:30:01Z'), 'il y a 59 min');
  assert.equal(ago('2026-10-22T08:30:00Z'), 'il y a 1 h');
  assert.equal(ago('2026-10-21T23:00:00Z'), 'il y a 10 h');
  assert.equal(ago('2026-10-21T09:30:00Z'), 'hier');
  assert.equal(ago('2026-10-21T00:00:00Z'), 'hier');
  assert.equal(ago('2026-10-20T23:59:00Z'), 'il y a 2 jours');
  assert.equal(ago('2026-09-22T12:00:00Z'), 'il y a 30 jours');
  assert.equal(ago('2026-09-21T12:00:00Z'), 'le 2026-09-21');
});

test('the page shows the relative date under each entry', () => {
  const now = new Date('2026-10-21T10:03:00Z');
  const yesterday: Entry = { id: 1, name: 'Ada', message: 'first', createdAt: new Date('2026-10-20T08:00:00Z') };
  const html = renderPage([entry(2, 'Bob', 'second'), yesterday], {}, now);
  assert.ok(html.includes('<p>second</p>\n      <p class="ago"><time datetime="2026-10-21T10:00:00.000Z">il y a 3 min</time></p>'));
  assert.ok(html.includes('<p>first</p>\n      <p class="ago"><time datetime="2026-10-20T08:00:00.000Z">hier</time></p>'));
});

test('the heading counts the entries', () => {
  const heading = (entries: readonly Entry[]) => renderPage(entries).match(/<h1>(.*)<\/h1>/)?.[1];
  assert.equal(heading([]), 'Guestbook (0 entries)');
  assert.equal(heading([entry(1, 'Ada', 'first')]), 'Guestbook (1 entry)');
  assert.equal(heading([entry(3, 'Cy', 'third'), entry(2, 'Bob', 'second'), entry(1, 'Ada', 'first')]), 'Guestbook (3 entries)');
});

test('the page has a form that posts to /entries', () => {
  const html = renderPage([]);
  assert.match(html, /<form method="post" action="\/entries">/);
  assert.match(html, /name="name"/);
  assert.match(html, /name="message"/);
  assert.ok(html.includes('No entries yet.'));
});

test('a notice is shown as a status, escaped, with an empty form', () => {
  const html = renderPage([], { notice: 'Your entry waits for review: the filter flagged <spam>.' });
  assert.ok(html.includes('<p role="status">Your entry waits for review: the filter flagged &lt;spam&gt;.</p>'));
  assert.ok(!html.includes('<p role="alert">'));
  assert.ok(html.includes('value=""'));
});

test('an error is shown with the values the visitor typed, escaped', () => {
  const html = renderPage([], { error: 'The message is empty.', name: '"Ada"', message: '' });
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('The message is empty.'));
  assert.ok(html.includes('value="&quot;Ada&quot;"'));
});
