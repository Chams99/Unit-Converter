import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
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
import { convertImage, ImageConversionError, type ImageConvertOptions, type ImageOutputFormat } from './services/image.js';

type CurrencyConfig =
  | { readonly provider: 'frankfurter'; readonly options?: FrankfurterOptions }
  | { readonly provider: 'currencyapi'; readonly options: CurrencyApiOptions };

export type AppOptions = {
  readonly currency?: CurrencyConfig;
  readonly image?: Partial<ImageConvertOptions>;
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
  if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return 'invalid_request';
  return 'internal_error';
}

function errorMessage(error: unknown): string {
  if (error instanceof ConversionError || error instanceof CurrencyProviderError || error instanceof ImageConversionError) return error.message;
  if ((error as { code?: string } | null)?.code === 'FST_ERR_VALIDATION') return 'Request did not match the expected shape.';
  if ((error as { code?: string } | null)?.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return 'Request body exceeds the allowed size.';
  if ((error as { code?: string } | null)?.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return 'Image upload must use multipart/form-data.';
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
  const currencyCache = new Map<string, { readonly quote: Awaited<ReturnType<typeof fetchFrankfurterRate>>; readonly expiresAt: number }>();
  let activeImageRequests = 0;
  const maxImageRequests = 2;
  const app = Fastify({
    logger: false,
    bodyLimit: 2 * 1024 * 1024,
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
    limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 10, parts: 11 },
  });

  app.setErrorHandler((error, request, reply) => {
    const status = errorStatus(error);
    const body = { code: errorCode(error), message: errorMessage(error), requestId: requestId(request) };
    request.log[status >= 500 ? 'error' : 'warn']({ err: error, requestId: body.requestId }, body.message);
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
    if (cached && cached.expiresAt > Date.now()) return cached.quote;
    const currency = options.currency ?? (process.env.CURRENCYAPI_API_KEY
      ? { provider: 'currencyapi' as const, options: { apiKey: process.env.CURRENCYAPI_API_KEY } }
      : { provider: 'frankfurter' as const });
    const quote = currency.provider === 'currencyapi'
      ? fetchCurrencyApiRate(query.base, query.quote, currency.options)
      : fetchFrankfurterRate(query.base, query.quote, currency.options);
    const resolved = await quote;
    if (currencyCache.size >= 256) currencyCache.delete(currencyCache.keys().next().value as string);
    currencyCache.set(cacheKey, { quote: resolved, expiresAt: Date.now() + Math.min(resolved.staleAfterSeconds * 1000, 60_000) });
    return resolved;
  });

  app.post('/v1/image/convert', async (request, reply) => {
    if (activeImageRequests >= maxImageRequests) throw new ImageConversionError('concurrency_limit', 'The image service is busy; retry shortly.');
    activeImageRequests += 1;
    try {
      let fileBuffer: Buffer | undefined;
      let fileCount = 0;
      const fields: Record<string, string> = {};
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          fileCount += 1;
          if (fileCount > 1) {
            part.file.resume();
            throw new ImageConversionError('invalid_options', 'Only one image file may be uploaded.');
          }
          fileBuffer = await part.toBuffer();
        } else if (typeof part.value === 'string') {
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
      const artifact = await convertImage(fileBuffer, { ...options.image, outputFormat, width, height, quality });
      return reply
        .type(artifact.mimeType)
        .header('Content-Disposition', `attachment; filename="converted.${artifact.format}"`)
        .header('Content-Length', artifact.bytes)
        .header('X-Image-Input-Format', artifact.inputFormat)
        .header('X-Image-Width', artifact.width)
        .header('X-Image-Height', artifact.height)
        .send(artifact.data);
    } finally {
      activeImageRequests -= 1;
    }
  });

  await app.ready();
  return app;
}
