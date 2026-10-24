import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, formatDateTime, renderPage } from '../src/page.ts';
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

test('each entry shows its date and time like "23 Oct 2026, 16:54", in the server time zone', () => {
  assert.equal(formatDateTime(new Date(2026, 9, 23, 16, 54)), '23 Oct 2026, 16:54');
  assert.equal(formatDateTime(new Date(2026, 2, 5, 9, 7)), '5 Mar 2026, 09:07');
  const written = new Date(2026, 9, 23, 16, 54);
  const html = renderPage([{ id: 1, name: 'Ada', message: 'first', createdAt: written }]);
  assert.ok(html.includes(`<time datetime="${written.toISOString()}">23 Oct 2026, 16:54</time>`));
});

test('the date and time follow the server time zone, not UTC', (t) => {
  const zone = process.env.TZ;
  t.after(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });
  process.env.TZ = 'Asia/Tokyo';
  // 15:30 UTC on the 23rd is 00:30 on the 24th in Tokyo (UTC+9).
  assert.equal(formatDateTime(new Date(Date.UTC(2026, 9, 23, 15, 30))), '24 Oct 2026, 00:30');
  assert.equal(formatDateTime(new Date(Date.UTC(2026, 9, 23, 15, 0))), '24 Oct 2026, 00:00');
  process.env.TZ = 'UTC';
  assert.equal(formatDateTime(new Date(Date.UTC(2026, 9, 23, 15, 30))), '23 Oct 2026, 15:30');
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
