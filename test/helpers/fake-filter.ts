// A fake filter API for the tests: POST /check answers as the filter API's
// contract says (ok, the listed words found, and severity), and every call is
// kept. 'old-contract' answers as the filter API did before severity, which
// the guestbook refuses.
// It listens on port 0 of 127.0.0.1, so it never takes a port in use.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeFilter = {
  readonly url: string;
  // The text of each POST /check, in order.
  readonly calls: string[];
  // What the next answers are: the contract's (the default), a status, or a body that is not the contract's.
  answer: 'contract' | 'old-contract' | number | string;
  close(): Promise<void>;
};

export async function fakeFilter(words: readonly string[] = ['spam', 'scam']): Promise<FakeFilter> {
  const fake: FakeFilter = {
    url: '',
    calls: [],
    answer: 'contract',
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      if (request.method !== 'POST' || request.url !== '/check' || request.headers['content-type'] !== 'application/json') {
        response.writeHead(400).end();
        return;
      }
      const { text } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { text: string };
      fake.calls.push(text);
      if (typeof fake.answer === 'number') {
        response.writeHead(fake.answer, { 'content-type': 'application/json' }).end('{}');
        return;
      }
      const found = [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => words.includes(word)))];
      const ok = found.length === 0;
      const body =
        fake.answer === 'contract' ? JSON.stringify({ ok, words: found, severity: ok ? 'none' : 'review' })
        : fake.answer === 'old-contract' ? JSON.stringify({ ok, words: found })
        : fake.answer;
      response.writeHead(200, { 'content-type': 'application/json' }).end(body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return Object.assign(fake, { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
}
