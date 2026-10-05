import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  convertValue,
  ConversionError,
  units,
  type ConvertOptions,
} from '@simple-units/conversion';
import {
  ConvertRequestSchema,
  ConvertResponseSchema,
  CurrencyQuerySchema,
  CurrencyResponseSchema,
  ErrorResponseSchema,
  UnitCatalogResponseSchema,
} from '@universal-convertal/contracts';
import {
  CurrencyProviderError,
  fetchCurrencyApiRate,
  fetchFrankfurterRate,
  type CurrencyApiOptions,
  type FrankfurterOptions,
} from './services/currency.js';
import { ImageConversionError, type ImageConvertOptions, type ImageOutputFormat } from './services/image-types.js';
import { convertImageInProcess } from './services/image-process.js';
import { TokenBucket } from './services/limits.js';

type CurrencyConfig =
  | { readonly provider: 'frankfurter'; readonly options?: FrankfurterOptions }
  | { readonly provider: 'currencyapi'; readonly options: CurrencyApiOptions };

export type AppOptions = {
  readonly currency?: CurrencyConfig;
  readonly image?: Partial<ImageConvertOptions>;
  readonly limits?: { readonly apiBurst?: number; readonly apiPerMinute?: number; readonly imageRequestMs?: number; readonly imagePerMinute?: number };
};

function requestId(request: FastifyRequest): string { return String(request.id || randomUUID()); }

function errorStatus(error: unknown): number {
  if (error instanceof ConversionError) return 422;
  if (error instanceof CurrencyProviderError) return error.status === 429 ? 429 : 503;
  if (error instanceof ImageConversionError) {
    if (error.code === 'concurrency_limit') return 429;
    return error.code === 'input_too_large' || error.code === 'pixels_too_large' || error.code === 'output_too_large' ? 413 : 422;
  }
  const code = (error as { code?: string } | null)?.code;
  if (code === 'FST_ERR_CTP_BODY_TOO_LARGE' || code === 'FST_REQ_FILE_TOO_LARGE') return 413;
  if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return 400;
  if (code === 'FST_PROTO_VIOLATION' || code === 'FST_INVALID_JSON_FIELD_ERROR') return 400;
  if (code === 'FST_ERR_CTP_INVALID_JSON_BODY') return 400;
  if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return 415;
  if (code === 'FST_ERR_VALIDATION' || code === 'FST_FILES_LIMIT' || code === 'FST_FIELDS_LIMIT' || code === 'FST_PARTS_LIMIT') return 400;
  return 500;
}

function errorCode(error: unknown): string {
  if (error instanceof ConversionError || error instanceof CurrencyProviderError || error instanceof ImageConversionError) return error.code;
  const code = (error as { code?: string } | null)?.code;
  if (code === 'FST_ERR_VALIDATION' || code === 'FST_FILES_LIMIT' || code === 'FST_FIELDS_LIMIT' || code === 'FST_PARTS_LIMIT') return 'invalid_request';
  if (code === 'FST_ERR_CTP_BODY_TOO_LARGE' || code === 'FST_REQ_FILE_TOO_LARGE') return 'input_too_large';
  if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return 'invalid_request';
  if (code === 'FST_PROTO_VIOLATION' || code === 'FST_INVALID_JSON_FIELD_ERROR') return 'invalid_request';
  if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return 'invalid_request';
  return 'internal_error';
}

function errorMessage(error: unknown): string {
  if (error instanceof ConversionError || error instanceof CurrencyProviderError || error instanceof ImageConversionError) return error.message;
  if ((error as { code?: string } | null)?.code === 'FST_ERR_VALIDATION') return 'Request did not match the expected shape.';
  if ((error as { code?: string } | null)?.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return 'Request body exceeds the allowed size.';
  if ((error as { code?: string } | null)?.code === 'FST_REQ_FILE_TOO_LARGE') return 'Image file exceeds the allowed size.';
  if ((error as { code?: string } | null)?.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return 'Image upload must use multipart/form-data.';
  if (['FST_PROTO_VIOLATION', 'FST_INVALID_JSON_FIELD_ERROR'].includes((error as { code?: string } | null)?.code ?? '')) return 'Multipart fields are invalid.';
  if ((error as { code?: string } | null)?.code === 'FST_ERR_CTP_INVALID_JSON_BODY') return 'Request body is not valid JSON.';
  if ((error as { code?: string } | null)?.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return 'Request uses an unsupported media type.';
  if (['FST_FILES_LIMIT', 'FST_FIELDS_LIMIT', 'FST_PARTS_LIMIT'].includes((error as { code?: string } | null)?.code ?? '')) return 'Multipart request contains too many parts.';
  return 'The server could not complete the request.';
}

function publicUnit(unit: (typeof units)[number]) {
  return { id: unit.id, label: unit.label, symbol: unit.symbol, dimension: unit.dimension, aliases: unit.aliases, kind: unit.kind };
}

function isJsonContentType(request: FastifyRequest): boolean {
  const contentType = request.headers['content-type'];
  return typeof contentType === 'string' && contentType.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  type Quote = Awaited<ReturnType<typeof fetchFrankfurterRate>>;
  const currencyCache = new Map<string, { readonly quote?: Quote; readonly error?: CurrencyProviderError; readonly expiresAt: number }>();
  const pendingQuotes = new Map<string, Promise<Quote>>();
  const providerBucket = new TokenBucket(5, 20);
  const apiBucket = new TokenBucket(options.limits?.apiBurst ?? 40, options.limits?.apiPerMinute ?? 120);
  const imageBucket = new TokenBucket(2, options.limits?.imagePerMinute ?? 12);
  const imageControllers = new Set<AbortController>();
  let activeApiRequests = 0;
  let activeImageRequests = 0;
  const maxImageRequests = 2;
  const app = Fastify({
    logger: process.env.NODE_ENV === 'production' ? { level: 'warn' } : false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 16 * 1024,
    connectionTimeout: 15_000,
    requestTimeout: 20_000,
    keepAliveTimeout: 5_000,
    maxRequestsPerSocket: 100,
    http: { maxHeaderSize: 8 * 1024, headersTimeout: 10_000, connectionsCheckingInterval: 1_000 },
    genReqId: () => randomUUID(),
  });
  await app.register(cors, { origin: false });
  await app.register(swagger, {
    openapi: {
      info: { title: 'Universal Convertal API', version: '0.1.0' },
      openapi: '3.1.0',
    },
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 4, parts: 5, fieldSize: 64, fieldNameSize: 32, headerPairs: 20 },
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'no-store');
    const path = request.url.split('?', 1)[0];
    // Health checks must remain available while conversion admission is full.
    if ((path === '/healthz' || path === '/readyz') && ['GET', 'HEAD'].includes(request.method)) return;
    if (request.url.length > 2_048) return reply.status(414).send({ code: 'invalid_request', message: 'Request URL is too long.', requestId: requestId(request) });
    if (activeApiRequests >= 32 || !apiBucket.take()) {
      return reply.header('Retry-After', String(apiBucket.retryAfterSeconds)).status(429).send({ code: 'rate_limited', message: 'The API is busy; retry shortly.', requestId: requestId(request) });
    }
    activeApiRequests += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeApiRequests -= 1;
      request.raw.removeListener('aborted', release);
      reply.raw.removeListener('close', release);
      reply.raw.removeListener('finish', release);
    };
    request.raw.once('aborted', release);
    reply.raw.once('close', release);
    reply.raw.once('finish', release);
  });
  app.addHook('preClose', async () => { for (const controller of imageControllers) controller.abort(); });

  app.setErrorHandler((error, request, reply) => {
    const status = errorStatus(error);
    const body = { code: errorCode(error), message: errorMessage(error), requestId: requestId(request) };
    if (status === 429) reply.header('Retry-After', '3');
    // Never log request bodies, URLs, filenames, provider errors or credentials.
    request.log[status >= 500 ? 'error' : 'warn']({ code: body.code, statusCode: status, requestId: body.requestId }, body.message);
    return reply.status(status).send(body);
  });

  app.get('/healthz', { schema: { response: { 200: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] } } } }, async () => ({ status: 'ok' }));
  app.get('/readyz', { schema: { response: { 200: { type: 'object', properties: { status: { type: 'string' }, currencyProvider: { type: 'string' } }, required: ['status', 'currencyProvider'] } } } }, async (_request, reply) => {
    const configured = options.currency?.provider ?? (process.env.CURRENCYAPI_API_KEY ? 'currencyapi' : 'frankfurter');
    return reply.send({ status: 'ok', currencyProvider: configured });
  });

  app.get('/v1/units', { schema: { response: { 200: UnitCatalogResponseSchema } } }, async () => ({ units: units.map(publicUnit) }));

  app.post('/v1/convert', {
    schema: { body: ConvertRequestSchema, response: { 200: ConvertResponseSchema, 400: ErrorResponseSchema, 415: ErrorResponseSchema, 422: ErrorResponseSchema } },
    preValidation: async (request, reply) => {
      if (!isJsonContentType(request)) return reply.status(415).send({ code: 'invalid_request', message: 'Request uses an unsupported media type.', requestId: requestId(request) });
    },
  }, async (request) => {
    const body = request.body as { value: string | number; from: string; to: string; precision?: number; maxMagnitude?: string };
    const conversion = convertValue(body.value, body.from, body.to, { precision: body.precision, maxMagnitude: body.maxMagnitude } satisfies ConvertOptions);
    return {
      value: conversion.value,
      from: { id: conversion.from.id, label: conversion.from.label, symbol: conversion.from.symbol },
      to: { id: conversion.to.id, label: conversion.to.label, symbol: conversion.to.symbol },
      dimension: conversion.dimension,
      precision: conversion.precision,
    };
  });

  app.get('/v1/currency/rates', {
    schema: { querystring: CurrencyQuerySchema, response: { 200: CurrencyResponseSchema, 400: ErrorResponseSchema, 429: ErrorResponseSchema, 503: ErrorResponseSchema } },
  }, async (request) => {
    const query = request.query as { base: string; quote: string };
    const cacheKey = `${query.base.toUpperCase()}:${query.quote.toUpperCase()}`;
    const cached = currencyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.error) throw cached.error;
      return cached.quote;
    }
    const pending = pendingQuotes.get(cacheKey);
    if (pending) return pending;
    for (const [key, entry] of currencyCache) if (entry.expiresAt <= Date.now()) currencyCache.delete(key);
    if (pendingQuotes.size >= 4 || !providerBucket.take()) throw new CurrencyProviderError('provider_rate_limited', 'Exchange-rate requests are temporarily limited; retry shortly.', 429);
    const currency = options.currency ?? (process.env.CURRENCYAPI_API_KEY
      ? { provider: 'currencyapi' as const, options: { apiKey: process.env.CURRENCYAPI_API_KEY } }
      : { provider: 'frankfurter' as const });
    const quote = currency.provider === 'currencyapi'
      ? fetchCurrencyApiRate(query.base, query.quote, currency.options)
      : fetchFrankfurterRate(query.base, query.quote, currency.options);
    const work = quote.then((resolved) => {
      if (currencyCache.size >= 256) currencyCache.delete(currencyCache.keys().next().value as string);
      currencyCache.set(cacheKey, { quote: resolved, expiresAt: Date.now() + Math.min(resolved.staleAfterSeconds * 1000, 60_000) });
      return resolved;
    }, (error: unknown) => {
      const safe = error instanceof CurrencyProviderError ? error : new CurrencyProviderError('provider_unavailable', 'Currency provider is unavailable.');
      if (currencyCache.size >= 256) currencyCache.delete(currencyCache.keys().next().value as string);
      currencyCache.set(cacheKey, { error: safe, expiresAt: Date.now() + 10_000 });
      throw safe;
    }).finally(() => { pendingQuotes.delete(cacheKey); });
    pendingQuotes.set(cacheKey, work);
    return work;
  });

  app.post('/v1/image/convert', async (request, reply) => {
    if (activeImageRequests >= maxImageRequests || !imageBucket.take()) {
      return reply.header('Retry-After', '5').status(429).send({ code: 'concurrency_limit', message: 'The image service is busy; retry shortly.', requestId: requestId(request) });
    }
    activeImageRequests += 1;
    const controller = new AbortController();
    imageControllers.add(controller);
    const stopUpload = () => { if (!request.raw.complete) request.raw.destroy(); };
    controller.signal.addEventListener('abort', stopUpload, { once: true });
    const cancel = () => { if (!reply.raw.writableFinished) controller.abort(); };
    request.raw.once('aborted', cancel);
    reply.raw.once('close', cancel);
    const deadline = setTimeout(() => { controller.abort(); request.raw.destroy(); }, options.limits?.imageRequestMs ?? 25_000);
    try {
      let fileBuffer: Buffer | undefined;
      let fileCount = 0;
      const fields: Record<string, string> = Object.create(null) as Record<string, string>;
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          fileCount += 1;
          if (fileCount > 1) {
            part.file.resume();
            throw new ImageConversionError('invalid_options', 'Only one image file may be uploaded.');
          }
          if (part.fieldname !== 'file') throw new ImageConversionError('invalid_options', 'Image file field must be named file.');
          fileBuffer = await part.toBuffer();
        } else {
          if (typeof part.value !== 'string' || !['outputFormat', 'width', 'height', 'quality'].includes(part.fieldname) || Object.hasOwn(fields, part.fieldname) || part.valueTruncated || part.fieldnameTruncated) throw new ImageConversionError('invalid_options', 'Image options are invalid or repeated.');
          fields[part.fieldname] = part.value;
        }
      }
      if (!fileBuffer) throw new ImageConversionError('conversion_failed', 'An image file is required.');
      const outputFormat = (fields.outputFormat ?? 'webp') as ImageOutputFormat;
      const widthText = fields.width;
      const heightText = fields.height;
      const qualityText = fields.quality;
      const width = widthText ? Number(widthText) : undefined;
      const height = heightText ? Number(heightText) : undefined;
      const quality = qualityText ? Number(qualityText) : undefined;
      const artifact = await convertImageInProcess(fileBuffer, { ...options.image, outputFormat, width, height, quality }, controller.signal);
      return reply
        .type(artifact.mimeType)
        .header('Content-Disposition', `attachment; filename="converted.${artifact.format}"`)
        .header('Content-Length', artifact.bytes)
        .header('X-Image-Input-Format', artifact.inputFormat)
        .header('X-Image-Width', artifact.width)
        .header('X-Image-Height', artifact.height)
        .send(artifact.data);
    } finally {
      clearTimeout(deadline);
      controller.signal.removeEventListener('abort', stopUpload);
      request.raw.removeListener('aborted', cancel);
      reply.raw.removeListener('close', cancel);
      imageControllers.delete(controller);
      activeImageRequests -= 1;
    }
  });

  await app.ready();
  return app;
}
