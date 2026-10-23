// The guestbook's client of the filter API (its contract/openapi.yaml):
// POST /check with {"text"} answers {"ok", "words", "severity"}. Any other
// answer, an error or no answer within the timeout is a FilterError, so the
// caller never stores an entry the filter has not checked. That includes an
// answer without "severity" (a filter API older than it), and one whose
// "severity" disagrees with "ok": none exactly when ok is true.

export type Severity = 'none' | 'review';

export type FilterVerdict = {
  readonly ok: boolean;
  readonly words: readonly string[];
  // none: the entry is shown; review: it is held until someone reviews it.
  readonly severity: Severity;
};

export interface Filter {
  check(text: string): Promise<FilterVerdict>;
}

export class FilterError extends Error {
  override name = 'FilterError';
}

export type FilterOptions = {
  // How long a check may take, in milliseconds.
  readonly timeoutMs?: number;
};

function verdict(body: unknown): FilterVerdict {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new FilterError('the answer is not an object');
  const { ok, words, severity } = body as { ok?: unknown; words?: unknown; severity?: unknown };
  if (typeof ok !== 'boolean') throw new FilterError('the answer has no boolean "ok"');
  if (!Array.isArray(words) || !words.every((word) => typeof word === 'string')) throw new FilterError('the answer has no "words" list of strings');
  if (severity !== 'none' && severity !== 'review') throw new FilterError('the answer has no "severity" of "none" or "review"');
  if ((severity === 'none') !== ok) throw new FilterError('the answer\'s "severity" disagrees with "ok"');
  return { ok, words, severity };
}

export function createFilter(baseUrl: string, options: FilterOptions = {}): Filter {
  const timeoutMs = options.timeoutMs ?? 2000;
  return {
    async check(text) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/check`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new FilterError(`the filter did not answer: ${(error as Error).name}`);
      }
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new FilterError(`the filter answered ${response.status}`);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new FilterError('the answer is not JSON');
      }
      return verdict(body);
    },
  };
}
