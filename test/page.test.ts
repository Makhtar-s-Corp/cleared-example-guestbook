import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderPage } from '../src/page.ts';
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
  const html = renderPage([], { notice: 'Your entry waits for <review>' });
  assert.ok(html.includes('<p role="status">Your entry waits for &lt;review&gt;.</p>'));
  assert.ok(!html.includes('<p role="alert">'));
  assert.ok(html.includes('value=""'));
});

test('each word the filter flagged is shown in bold after the notice, escaped', () => {
  const html = renderPage([], { notice: 'Your entry waits for review', flagged: ['casino', '<spam>'] });
  assert.ok(html.includes('<p role="status">Your entry waits for review: the filter flagged <strong>casino</strong>, <strong>&lt;spam&gt;</strong>.</p>'));
  assert.ok(renderPage([], { notice: 'Your entry waits for review', flagged: [] }).includes('<p role="status">Your entry waits for review.</p>'));
});

test('an error is shown with the values the visitor typed, escaped', () => {
  const html = renderPage([], { error: 'The message is empty.', name: '"Ada"', message: '' });
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('The message is empty.'));
  assert.ok(html.includes('value="&quot;Ada&quot;"'));
});
