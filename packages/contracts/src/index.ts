import { Type, type Static } from '@sinclair/typebox';

export const errorCodes = [
  'invalid_request',
  'invalid_value',
  'unknown_unit',
  'incompatible_dimensions',
  'incompatible_temperature_kind',
  'below_absolute_zero',
  'result_out_of_range',
  'invalid_expression',
  'provider_unavailable',
  'provider_rate_limited',
  'provider_invalid_response',
  'stale_rate',
  'input_too_large',
  'pixels_too_large',
  'unsupported_format',
  'invalid_options',
  'conversion_failed',
  'output_too_large',
  'concurrency_limit',
  'rate_limited',
  'internal_error',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const ErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Record(Type.String(), Type.String())),
  requestId: Type.String(),
}, { additionalProperties: false });
export type ErrorResponse = Static<typeof ErrorResponseSchema>;

export const ConvertRequestSchema = Type.Object({
  value: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Number({ exclusiveMaximum: 1e100, exclusiveMinimum: -1e100 })]),
  from: Type.String({ minLength: 1, maxLength: 64 }),
  to: Type.String({ minLength: 1, maxLength: 64 }),
  precision: Type.Optional(Type.Integer({ minimum: 8, maximum: 100 })),
  maxMagnitude: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
}, { additionalProperties: false });
export type ConvertRequest = Static<typeof ConvertRequestSchema>;

export const DimensionSchema = Type.Record(Type.String({ maxLength: 32 }), Type.Integer({ minimum: -16, maximum: 16 }));

export const ConvertResponseSchema = Type.Object({
  value: Type.String(),
  from: Type.Object({ id: Type.String(), label: Type.String(), symbol: Type.String() }),
  to: Type.Object({ id: Type.String(), label: Type.String(), symbol: Type.String() }),
  dimension: DimensionSchema,
  precision: Type.Integer({ minimum: 8, maximum: 100 }),
}, { additionalProperties: false });
export type ConvertResponse = Static<typeof ConvertResponseSchema>;

export const UnitCatalogItemSchema = Type.Object({
  id: Type.String(),
  label: Type.String(),
  symbol: Type.String(),
  dimension: DimensionSchema,
  aliases: Type.Array(Type.String()),
  kind: Type.Union([Type.Literal('absolute'), Type.Literal('delta')]),
}, { additionalProperties: false });
export const UnitCatalogResponseSchema = Type.Object({
  units: Type.Array(UnitCatalogItemSchema),
}, { additionalProperties: false });
export type UnitCatalogResponse = Static<typeof UnitCatalogResponseSchema>;

export const CurrencyQuerySchema = Type.Object({
  base: Type.String({ minLength: 3, maxLength: 3, pattern: '^[A-Za-z]{3}$' }),
  quote: Type.String({ minLength: 3, maxLength: 3, pattern: '^[A-Za-z]{3}$' }),
}, { additionalProperties: false });
export type CurrencyQuery = Static<typeof CurrencyQuerySchema>;

export const CurrencyResponseSchema = Type.Object({
  provider: Type.String(),
  base: Type.String({ minLength: 3, maxLength: 3 }),
  quote: Type.String({ minLength: 3, maxLength: 3 }),
  rate: Type.String(),
  sourceTimestamp: Type.Union([Type.String(), Type.Null()]),
  fetchedAt: Type.String(),
  stale: Type.Boolean(),
  staleAfterSeconds: Type.Number({ minimum: 1 }),
}, { additionalProperties: false });
export type CurrencyResponse = Static<typeof CurrencyResponseSchema>;
