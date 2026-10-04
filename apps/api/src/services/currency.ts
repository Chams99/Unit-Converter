export type CurrencyRateResponse = {
  readonly meta?: { readonly last_updated_at?: string };
  readonly data?: Record<string, { readonly code?: string; readonly value?: number }>;
};

export type FxQuote = {
  readonly provider: string;
  readonly base: string;
  readonly quote: string;
  readonly rate: string;
  readonly sourceTimestamp: string | null;
  readonly fetchedAt: string;
  readonly stale: boolean;
  readonly staleAfterSeconds: number;
};

export type CurrencyApiOptions = {
  readonly apiKey: string;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly staleAfterSeconds?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
};

export type FrankfurterOptions = {
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly staleAfterSeconds?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
};

export class CurrencyProviderError extends Error {
  readonly code: 'provider_unavailable' | 'provider_rate_limited' | 'provider_invalid_response' | 'stale_rate';
  readonly status?: number;
  constructor(code: CurrencyProviderError['code'], message: string, status?: number) {
    super(message);
    this.name = 'CurrencyProviderError';
    this.code = code;
    this.status = status;
  }
}

function validCode(code: string): boolean { return /^[A-Z]{3}$/.test(code); }

async function readBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > maximumBytes) {
    throw new CurrencyProviderError('provider_invalid_response', 'Currency provider response is too large.');
  }
  let text: string;
  if (!response.body) {
    text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maximumBytes) {
      throw new CurrencyProviderError('provider_invalid_response', 'Currency provider response is too large.');
    }
  } else {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > maximumBytes) {
          await reader.cancel();
          throw new CurrencyProviderError('provider_invalid_response', 'Currency provider response is too large.');
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(bytes);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CurrencyProviderError('provider_invalid_response', 'Currency provider returned invalid JSON.');
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CurrencyProviderError('provider_unavailable', 'Currency provider did not respond in time.'));
      }, timeoutMs);
    });
    return await Promise.race([fetchImpl(input, { ...init, signal: controller.signal }), timeout]);
  } catch (error) {
    if (error instanceof CurrencyProviderError) throw error;
    throw new CurrencyProviderError('provider_unavailable', 'Currency provider did not respond in time.');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchCurrencyApiRate(base: string, quote: string, options: CurrencyApiOptions): Promise<FxQuote> {
  const normalizedBase = base.toUpperCase();
  const normalizedQuote = quote.toUpperCase();
  if (!validCode(normalizedBase) || !validCode(normalizedQuote)) throw new CurrencyProviderError('provider_invalid_response', 'Currency codes must be three uppercase letters.');
  if (!options.apiKey) throw new CurrencyProviderError('provider_unavailable', 'Currency provider is not configured.');
  const timeoutMs = options.timeoutMs ?? 3_000;
  const staleAfterSeconds = options.staleAfterSeconds ?? 86_400;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 15_000 || !Number.isFinite(staleAfterSeconds) || staleAfterSeconds <= 0) {
    throw new CurrencyProviderError('provider_unavailable', 'Currency provider limits are not configured safely.');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const endpoint = options.endpoint ?? 'https://api.currencyapi.com/v3/latest';
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new CurrencyProviderError('provider_unavailable', 'Currency provider endpoint is not configured safely.');
  }
  url.searchParams.set('base_currency', normalizedBase);
  url.searchParams.set('currencies', normalizedQuote);
  const response = await fetchWithTimeout(fetchImpl, url, { headers: { apikey: options.apiKey, accept: 'application/json' } }, timeoutMs);
  if (response.status === 429) throw new CurrencyProviderError('provider_rate_limited', 'Currency provider rate limit reached.', response.status);
  if (!response.ok) throw new CurrencyProviderError('provider_unavailable', 'Currency provider request failed.', response.status);
  const body = await readBoundedJson(response, 64 * 1024) as CurrencyRateResponse;
  const entry = body.data?.[normalizedQuote];
  if (!entry || entry.code !== normalizedQuote || typeof entry.value !== 'number' || !Number.isFinite(entry.value) || entry.value <= 0) {
    throw new CurrencyProviderError('provider_invalid_response', 'Currency provider returned no valid rate for the requested currency.');
  }
  const sourceTimestamp = body.meta?.last_updated_at ?? null;
  const fetchedAt = now();
  if (Number.isNaN(fetchedAt.getTime())) throw new CurrencyProviderError('provider_invalid_response', 'Server clock is invalid.');
  const sourceMillis = sourceTimestamp ? Date.parse(sourceTimestamp) : NaN;
  if (sourceTimestamp && Number.isNaN(sourceMillis)) throw new CurrencyProviderError('provider_invalid_response', 'Currency provider returned an invalid update timestamp.');
  if (Number.isFinite(sourceMillis) && sourceMillis > fetchedAt.getTime() + 5 * 60 * 1000) throw new CurrencyProviderError('provider_invalid_response', 'Currency provider timestamp is in the future.');
  const stale = Number.isFinite(sourceMillis) ? (fetchedAt.getTime() - sourceMillis) / 1000 > staleAfterSeconds : true;
  return { provider: 'currencyapi', base: normalizedBase, quote: normalizedQuote, rate: String(entry.value), sourceTimestamp, fetchedAt: fetchedAt.toISOString(), stale, staleAfterSeconds };
}

type FrankfurterResponse = { readonly date?: string; readonly base?: string; readonly quote?: string; readonly rate?: number };

export async function fetchFrankfurterRate(base: string, quote: string, options: FrankfurterOptions = {}): Promise<FxQuote> {
  const normalizedBase = base.toUpperCase();
  const normalizedQuote = quote.toUpperCase();
  if (!validCode(normalizedBase) || !validCode(normalizedQuote)) throw new CurrencyProviderError('provider_invalid_response', 'Currency codes must be three uppercase letters.');
  const timeoutMs = options.timeoutMs ?? 3_000;
  const staleAfterSeconds = options.staleAfterSeconds ?? 172_800;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 15_000 || !Number.isFinite(staleAfterSeconds) || staleAfterSeconds <= 0) throw new CurrencyProviderError('provider_unavailable', 'Currency provider limits are not configured safely.');
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const endpoint = options.endpoint ?? 'https://api.frankfurter.dev/v2';
  const response = await fetchWithTimeout(fetchImpl, `${endpoint.replace(/\/$/, '')}/rate/${normalizedBase.toLowerCase()}/${normalizedQuote.toLowerCase()}`, { headers: { accept: 'application/json' } }, timeoutMs);
  if (response.status === 429) throw new CurrencyProviderError('provider_rate_limited', 'Currency provider rate limit reached.', response.status);
  if (!response.ok) throw new CurrencyProviderError('provider_unavailable', 'Currency provider request failed.', response.status);
  const body = await readBoundedJson(response, 32 * 1024) as FrankfurterResponse;
  if (body.base?.toUpperCase() !== normalizedBase || body.quote?.toUpperCase() !== normalizedQuote || typeof body.rate !== 'number' || !Number.isFinite(body.rate) || body.rate <= 0 || !body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new CurrencyProviderError('provider_invalid_response', 'Currency provider returned no valid rate for the requested currency.');
  const fetchedAt = now();
  const sourceMillis = Date.parse(`${body.date}T00:00:00Z`);
  if (Number.isNaN(sourceMillis) || new Date(sourceMillis).toISOString().slice(0, 10) !== body.date || Number.isNaN(fetchedAt.getTime()) || sourceMillis > fetchedAt.getTime() + 5 * 60 * 1000) throw new CurrencyProviderError('provider_invalid_response', 'Currency provider timestamp is invalid.');
  const stale = (fetchedAt.getTime() - sourceMillis) / 1000 > staleAfterSeconds;
  // Frankfurter publishes a source *date*, not an intraday timestamp. Keep
  // that precision instead of manufacturing a midnight timestamp.
  return { provider: 'frankfurter', base: normalizedBase, quote: normalizedQuote, rate: String(body.rate), sourceTimestamp: body.date, fetchedAt: fetchedAt.toISOString(), stale, staleAfterSeconds };
}
