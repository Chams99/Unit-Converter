import Decimal from 'decimal.js';

export type DimensionName =
  | 'length'
  | 'area'
  | 'volume'
  | 'mass'
  | 'time'
  | 'speed'
  | 'pressure'
  | 'energy'
  | 'power'
  | 'angle'
  | 'data'
  | 'temperature';

export type Dimension = Readonly<Record<string, number>>;
export type UnitKind = 'absolute' | 'delta';

export type UnitDefinition = {
  readonly id: string;
  readonly label: string;
  readonly symbol: string;
  readonly dimension: Dimension;
  /** Decimal multiplier to the canonical base unit. */
  readonly scale: string;
  /** Affine offset applied before scale: canonical = (value + offset) * scale. */
  readonly offset?: string;
  readonly kind: UnitKind;
  readonly aliases: readonly string[];
  /** The smallest valid absolute value, for absolute temperature units. */
  readonly minimum?: string;
};

export type ConversionErrorCode =
  | 'invalid_value'
  | 'unknown_unit'
  | 'incompatible_dimensions'
  | 'incompatible_temperature_kind'
  | 'below_absolute_zero'
  | 'result_out_of_range'
  | 'invalid_expression';

export class ConversionError extends Error {
  readonly code: ConversionErrorCode;
  readonly details?: Readonly<Record<string, string>>;

  constructor(code: ConversionErrorCode, message: string, details?: Readonly<Record<string, string>>) {
    super(message);
    this.name = 'ConversionError';
    this.code = code;
    this.details = details;
  }
}

const dim = (name: string, exponent = 1): Dimension => ({ [name]: exponent });
const temperatureDim = dim('temperature');
const noOffset = undefined;

/**
 * A reviewed registry. `scale` and `offset` are strings so that the Decimal
 * constructor never receives an already-rounded JavaScript number.
 */
export const units: readonly UnitDefinition[] = [
  // Length (metre is canonical)
  { id: 'meter', label: 'Meter', symbol: 'm', dimension: dim('length'), scale: '1', kind: 'absolute', aliases: ['m', 'metre', 'meters', 'metres'] },
  { id: 'kilometer', label: 'Kilometer', symbol: 'km', dimension: dim('length'), scale: '1000', kind: 'absolute', aliases: ['km', 'kilometre', 'kilometers', 'kilometres'] },
  { id: 'centimeter', label: 'Centimeter', symbol: 'cm', dimension: dim('length'), scale: '0.01', kind: 'absolute', aliases: ['cm', 'centimetre', 'centimeters', 'centimetres'] },
  { id: 'millimeter', label: 'Millimeter', symbol: 'mm', dimension: dim('length'), scale: '0.001', kind: 'absolute', aliases: ['mm', 'millimetre', 'millimeters', 'millimetres'] },
  { id: 'micrometer', label: 'Micrometer', symbol: 'µm', dimension: dim('length'), scale: '0.000001', kind: 'absolute', aliases: ['um', 'µm', 'micron', 'micrometre'] },
  { id: 'mile', label: 'Mile', symbol: 'mi', dimension: dim('length'), scale: '1609.344', kind: 'absolute', aliases: ['mi', 'mile', 'miles'] },
  { id: 'yard', label: 'Yard', symbol: 'yd', dimension: dim('length'), scale: '0.9144', kind: 'absolute', aliases: ['yd', 'yard', 'yards'] },
  { id: 'foot', label: 'Foot', symbol: 'ft', dimension: dim('length'), scale: '0.3048', kind: 'absolute', aliases: ['ft', 'foot', 'feet'] },
  { id: 'inch', label: 'Inch', symbol: 'in', dimension: dim('length'), scale: '0.0254', kind: 'absolute', aliases: ['in', 'inch', 'inches'] },
  { id: 'nautical-mile', label: 'Nautical mile', symbol: 'nmi', dimension: dim('length'), scale: '1852', kind: 'absolute', aliases: ['nmi', 'nautical-mile', 'nautical-miles'] },

  // Area (square metre is canonical)
  { id: 'square-meter', label: 'Square meter', symbol: 'm²', dimension: dim('length', 2), scale: '1', kind: 'absolute', aliases: ['m2', 'm^2', 'square-meter', 'square-metre'] },
  { id: 'square-kilometer', label: 'Square kilometer', symbol: 'km²', dimension: dim('length', 2), scale: '1000000', kind: 'absolute', aliases: ['km2', 'km^2', 'square-kilometer', 'square-kilometre'] },
  { id: 'square-foot', label: 'Square foot', symbol: 'ft²', dimension: dim('length', 2), scale: '0.09290304', kind: 'absolute', aliases: ['ft2', 'ft^2', 'square-foot', 'square-feet'] },
  { id: 'square-yard', label: 'Square yard', symbol: 'yd²', dimension: dim('length', 2), scale: '0.83612736', kind: 'absolute', aliases: ['yd2', 'yd^2', 'square-yard'] },
  { id: 'hectare', label: 'Hectare', symbol: 'ha', dimension: dim('length', 2), scale: '10000', kind: 'absolute', aliases: ['ha', 'hectare', 'hectares'] },
  { id: 'acre', label: 'Acre', symbol: 'ac', dimension: dim('length', 2), scale: '4046.8564224', kind: 'absolute', aliases: ['ac', 'acre', 'acres'] },

  // Volume (litre is the product base; cubic metre has an exact relationship)
  { id: 'liter', label: 'Liter', symbol: 'L', dimension: dim('volume'), scale: '1', kind: 'absolute', aliases: ['L', 'l', 'liter', 'litre', 'liters', 'litres'] },
  { id: 'milliliter', label: 'Milliliter', symbol: 'mL', dimension: dim('volume'), scale: '0.001', kind: 'absolute', aliases: ['mL', 'ml', 'milliliter', 'millilitre'] },
  { id: 'cubic-meter', label: 'Cubic meter', symbol: 'm³', dimension: dim('volume'), scale: '1000', kind: 'absolute', aliases: ['m3', 'm^3', 'cubic-meter', 'cubic-metre'] },
  { id: 'cubic-centimeter', label: 'Cubic centimeter', symbol: 'cm³', dimension: dim('volume'), scale: '0.001', kind: 'absolute', aliases: ['cm3', 'cm^3', 'cc', 'cubic-centimeter'] },
  { id: 'gallon-us', label: 'US liquid gallon', symbol: 'gal US', dimension: dim('volume'), scale: '3.785411784', kind: 'absolute', aliases: ['gal', 'gal-us', 'gallon', 'gallons', 'us-gallon'] },
  { id: 'gallon-imperial', label: 'Imperial gallon', symbol: 'gal Imp', dimension: dim('volume'), scale: '4.54609', kind: 'absolute', aliases: ['gal-imp', 'imperial-gallon', 'imperial-gallons'] },
  { id: 'cup-us', label: 'US customary cup', symbol: 'cup', dimension: dim('volume'), scale: '0.2365882365', kind: 'absolute', aliases: ['cup', 'cups', 'us-cup'] },
  { id: 'tablespoon-us', label: 'US tablespoon', symbol: 'tbsp', dimension: dim('volume'), scale: '0.01478676478125', kind: 'absolute', aliases: ['tbsp', 'tablespoon', 'tablespoons'] },
  { id: 'teaspoon-us', label: 'US teaspoon', symbol: 'tsp', dimension: dim('volume'), scale: '0.00492892159375', kind: 'absolute', aliases: ['tsp', 'teaspoon', 'teaspoons'] },

  // Mass (gram is canonical)
  { id: 'gram', label: 'Gram', symbol: 'g', dimension: dim('mass'), scale: '1', kind: 'absolute', aliases: ['g', 'gram', 'grams'] },
  { id: 'kilogram', label: 'Kilogram', symbol: 'kg', dimension: dim('mass'), scale: '1000', kind: 'absolute', aliases: ['kg', 'kilogram', 'kilograms'] },
  { id: 'milligram', label: 'Milligram', symbol: 'mg', dimension: dim('mass'), scale: '0.001', kind: 'absolute', aliases: ['mg', 'milligram', 'milligrams'] },
  { id: 'metric-ton', label: 'Metric ton', symbol: 't', dimension: dim('mass'), scale: '1000000', kind: 'absolute', aliases: ['t', 'tonne', 'metric-ton', 'metric-tonne'] },
  { id: 'pound', label: 'Pound', symbol: 'lb', dimension: dim('mass'), scale: '453.59237', kind: 'absolute', aliases: ['lb', 'lbs', 'pound', 'pounds'] },
  { id: 'ounce', label: 'Ounce', symbol: 'oz', dimension: dim('mass'), scale: '28.349523125', kind: 'absolute', aliases: ['oz', 'ounce', 'ounces'] },

  // Time (second is canonical)
  { id: 'second', label: 'Second', symbol: 's', dimension: dim('time'), scale: '1', kind: 'absolute', aliases: ['s', 'sec', 'second', 'seconds'] },
  { id: 'millisecond', label: 'Millisecond', symbol: 'ms', dimension: dim('time'), scale: '0.001', kind: 'absolute', aliases: ['ms', 'millisecond', 'milliseconds'] },
  { id: 'minute', label: 'Minute', symbol: 'min', dimension: dim('time'), scale: '60', kind: 'absolute', aliases: ['min', 'minute', 'minutes'] },
  { id: 'hour', label: 'Hour', symbol: 'h', dimension: dim('time'), scale: '3600', kind: 'absolute', aliases: ['h', 'hr', 'hour', 'hours'] },
  { id: 'day', label: 'Day', symbol: 'd', dimension: dim('time'), scale: '86400', kind: 'absolute', aliases: ['d', 'day', 'days'] },
  { id: 'week', label: 'Week', symbol: 'wk', dimension: dim('time'), scale: '604800', kind: 'absolute', aliases: ['wk', 'week', 'weeks'] },

  // Derived mechanical units
  { id: 'meter-per-second', label: 'Meter per second', symbol: 'm/s', dimension: { length: 1, time: -1 }, scale: '1', kind: 'absolute', aliases: ['m/s', 'mps'] },
  { id: 'kilometer-per-hour', label: 'Kilometer per hour', symbol: 'km/h', dimension: { length: 1, time: -1 }, scale: '0.2777777777777777777777777778', kind: 'absolute', aliases: ['km/h', 'kmph', 'kph'] },
  { id: 'mile-per-hour', label: 'Mile per hour', symbol: 'mph', dimension: { length: 1, time: -1 }, scale: '0.44704', kind: 'absolute', aliases: ['mph', 'mi/h'] },
  { id: 'knot', label: 'Knot', symbol: 'kn', dimension: { length: 1, time: -1 }, scale: '0.5144444444444444444444444444', kind: 'absolute', aliases: ['kn', 'knot', 'knots'] },
  { id: 'pascal', label: 'Pascal', symbol: 'Pa', dimension: { mass: 1, length: -1, time: -2 }, scale: '1', kind: 'absolute', aliases: ['Pa', 'pascal', 'pascals'] },
  { id: 'kilopascal', label: 'Kilopascal', symbol: 'kPa', dimension: { mass: 1, length: -1, time: -2 }, scale: '1000', kind: 'absolute', aliases: ['kPa', 'kilopascal', 'kilopascals'] },
  { id: 'bar', label: 'Bar', symbol: 'bar', dimension: { mass: 1, length: -1, time: -2 }, scale: '100000', kind: 'absolute', aliases: ['bar', 'bars'] },
  { id: 'psi', label: 'Pound per square inch', symbol: 'psi', dimension: { mass: 1, length: -1, time: -2 }, scale: '6894.757293168', kind: 'absolute', aliases: ['psi', 'lb/in2', 'pound-force-per-square-inch'] },
  { id: 'atmosphere', label: 'Standard atmosphere', symbol: 'atm', dimension: { mass: 1, length: -1, time: -2 }, scale: '101325', kind: 'absolute', aliases: ['atm', 'atmosphere', 'standard-atmosphere'] },
  { id: 'joule', label: 'Joule', symbol: 'J', dimension: { mass: 1, length: 2, time: -2 }, scale: '1', kind: 'absolute', aliases: ['J', 'joule', 'joules'] },
  { id: 'kilojoule', label: 'Kilojoule', symbol: 'kJ', dimension: { mass: 1, length: 2, time: -2 }, scale: '1000', kind: 'absolute', aliases: ['kJ', 'kilojoule', 'kilojoules'] },
  { id: 'calorie', label: 'Thermochemical calorie', symbol: 'cal', dimension: { mass: 1, length: 2, time: -2 }, scale: '4.184', kind: 'absolute', aliases: ['cal', 'calorie', 'calories'] },
  { id: 'kilocalorie', label: 'Thermochemical kilocalorie', symbol: 'kcal', dimension: { mass: 1, length: 2, time: -2 }, scale: '4184', kind: 'absolute', aliases: ['kcal', 'kilocalorie', 'kilocalories'] },
  { id: 'watt', label: 'Watt', symbol: 'W', dimension: { mass: 1, length: 2, time: -3 }, scale: '1', kind: 'absolute', aliases: ['W', 'watt', 'watts'] },
  { id: 'kilowatt', label: 'Kilowatt', symbol: 'kW', dimension: { mass: 1, length: 2, time: -3 }, scale: '1000', kind: 'absolute', aliases: ['kW', 'kilowatt', 'kilowatts'] },
  { id: 'horsepower', label: 'Mechanical horsepower', symbol: 'hp', dimension: { mass: 1, length: 2, time: -3 }, scale: '745.69987158227022', kind: 'absolute', aliases: ['hp', 'horsepower'] },

  // Angle (radian is canonical)
  { id: 'radian', label: 'Radian', symbol: 'rad', dimension: dim('angle'), scale: '1', kind: 'absolute', aliases: ['rad', 'radian', 'radians'] },
  { id: 'degree', label: 'Degree', symbol: '°', dimension: dim('angle'), scale: '0.0174532925199432957692369077', kind: 'absolute', aliases: ['deg', 'degree', 'degrees', '°'] },
  { id: 'arcminute', label: 'Arcminute', symbol: '′', dimension: dim('angle'), scale: '0.000290888208665721596153948', kind: 'absolute', aliases: ['arcmin', 'arcminute', 'arcminutes'] },
  { id: 'arcsecond', label: 'Arcsecond', symbol: '″', dimension: dim('angle'), scale: '0.000004848136811095359935899', kind: 'absolute', aliases: ['arcsec', 'arcsecond', 'arcseconds'] },

  // Energy and storage data
  { id: 'watt-hour', label: 'Watt hour', symbol: 'Wh', dimension: { mass: 1, length: 2, time: -2 }, scale: '3600', kind: 'absolute', aliases: ['Wh', 'watt-hour', 'watt-hours'] },
  { id: 'kilowatt-hour', label: 'Kilowatt hour', symbol: 'kWh', dimension: { mass: 1, length: 2, time: -2 }, scale: '3600000', kind: 'absolute', aliases: ['kWh', 'kilowatt-hour', 'kilowatt-hours'] },
  { id: 'bit', label: 'Bit', symbol: 'bit', dimension: dim('data'), scale: '1', kind: 'absolute', aliases: ['bit', 'bits', 'b'] },
  { id: 'byte', label: 'Byte', symbol: 'B', dimension: dim('data'), scale: '8', kind: 'absolute', aliases: ['B', 'byte', 'bytes'] },
  { id: 'kilobyte', label: 'Kilobyte (decimal)', symbol: 'kB', dimension: dim('data'), scale: '8000', kind: 'absolute', aliases: ['kB', 'KB', 'kilobyte', 'kilobytes'] },
  { id: 'kibibyte', label: 'Kibibyte', symbol: 'KiB', dimension: dim('data'), scale: '8192', kind: 'absolute', aliases: ['KiB', 'kibibyte', 'kibibytes'] },
  { id: 'megabyte', label: 'Megabyte (decimal)', symbol: 'MB', dimension: dim('data'), scale: '8000000', kind: 'absolute', aliases: ['MB', 'megabyte', 'megabytes'] },
  { id: 'mebibyte', label: 'Mebibyte', symbol: 'MiB', dimension: dim('data'), scale: '8388608', kind: 'absolute', aliases: ['MiB', 'mebibyte', 'mebibytes'] },
  { id: 'gigabyte', label: 'Gigabyte (decimal)', symbol: 'GB', dimension: dim('data'), scale: '8000000000', kind: 'absolute', aliases: ['GB', 'gigabyte', 'gigabytes'] },
  { id: 'gibibyte', label: 'Gibibyte', symbol: 'GiB', dimension: dim('data'), scale: '8589934592', kind: 'absolute', aliases: ['GiB', 'gibibyte', 'gibibytes'] },

  // Absolute temperatures: canonical base is °C. Offsets are added first.
  { id: 'celsius', label: 'Celsius', symbol: '°C', dimension: temperatureDim, scale: '1', offset: '0', minimum: '-273.15', kind: 'absolute', aliases: ['C', '°C', 'c', 'celsius'] },
  { id: 'fahrenheit', label: 'Fahrenheit', symbol: '°F', dimension: temperatureDim, scale: '0.5555555555555555555555555556', offset: '-32', minimum: '-459.67', kind: 'absolute', aliases: ['F', '°F', 'f', 'fahrenheit'] },
  { id: 'kelvin', label: 'Kelvin', symbol: 'K', dimension: temperatureDim, scale: '1', offset: '-273.15', minimum: '0', kind: 'absolute', aliases: ['K', 'kelvin', 'kelvins'] },
  // Temperature differences have no absolute-zero bound and no offset.
  { id: 'delta-celsius', label: 'Celsius difference', symbol: 'Δ°C', dimension: temperatureDim, scale: '1', kind: 'delta', aliases: ['delta-C', 'delta-celsius', 'Δ°C'] },
  { id: 'delta-fahrenheit', label: 'Fahrenheit difference', symbol: 'Δ°F', dimension: temperatureDim, scale: '0.5555555555555555555555555556', kind: 'delta', aliases: ['delta-F', 'delta-fahrenheit', 'Δ°F'] },
  { id: 'delta-kelvin', label: 'Kelvin difference', symbol: 'ΔK', dimension: temperatureDim, scale: '1', kind: 'delta', aliases: ['delta-K', 'delta-kelvin', 'ΔK'] },
];

const byId = new Map<string, UnitDefinition>(units.map((unit) => [unit.id, unit]));
const byExactAlias = new Map<string, UnitDefinition>();
const byAlias = new Map<string, UnitDefinition>();
for (const unit of units) {
  byExactAlias.set(unit.id, unit);
  byExactAlias.set(unit.symbol, unit);
  byAlias.set(unit.id.toLowerCase(), unit);
  byAlias.set(unit.symbol.toLowerCase(), unit);
  for (const alias of unit.aliases) {
    byExactAlias.set(alias, unit);
    byAlias.set(alias.toLowerCase(), unit);
  }
}

const normalizedDimension = (dimension: Dimension): Dimension => {
  const result: Record<string, number> = {};
  for (const [name, exponent] of Object.entries(dimension)) {
    if (exponent !== 0) result[name] = exponent;
  }
  return result;
};

const sameDimension = (left: Dimension, right: Dimension): boolean => {
  const a = normalizedDimension(left);
  const b = normalizedDimension(right);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let matches = true;
  keys.forEach((key) => {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) matches = false;
  });
  return matches;
};

function parseDecimal(value: string | number, DecimalConstructor: typeof Decimal = Decimal): Decimal {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new ConversionError('invalid_value', 'Value must be finite.');
  }
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!text || !/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(text)) {
    throw new ConversionError('invalid_value', 'Value must be a finite decimal number.');
  }
  try {
    const parsed = new DecimalConstructor(text);
    if (!parsed.isFinite()) throw new Error('not finite');
    return parsed;
  } catch {
    throw new ConversionError('invalid_value', 'Value must be a finite decimal number.');
  }
}

export function getUnit(idOrAlias: string): UnitDefinition {
  if (typeof idOrAlias !== 'string' || !idOrAlias.trim()) {
    throw new ConversionError('unknown_unit', 'Unit is required.');
  }
  const trimmed = idOrAlias.trim();
  const unit = byId.get(trimmed) ?? byExactAlias.get(trimmed) ?? byAlias.get(trimmed.toLowerCase());
  if (!unit) throw new ConversionError('unknown_unit', `Unknown unit: ${idOrAlias}.`, { unit: idOrAlias });
  return unit;
}

export function listUnits(dimension?: Dimension): readonly UnitDefinition[] {
  return dimension ? units.filter((unit) => sameDimension(unit.dimension, dimension)) : units;
}

export type Conversion = {
  readonly value: string;
  readonly from: UnitDefinition;
  readonly to: UnitDefinition;
  readonly dimension: Dimension;
  readonly precision: number;
};

export type ConvertOptions = {
  /** Significant digits used by Decimal.js for the calculation. */
  readonly precision?: number;
  /** Maximum absolute result accepted by the API. */
  readonly maxMagnitude?: string;
};

export function convertValue(
  value: string | number,
  fromId: string,
  toId: string,
  options: ConvertOptions = {},
): Conversion {
  const from = getUnit(fromId);
  const to = getUnit(toId);
  if (!sameDimension(from.dimension, to.dimension)) {
    throw new ConversionError('incompatible_dimensions', `${from.id} and ${to.id} measure different dimensions.`, {
      from: from.id,
      to: to.id,
    });
  }
  if (from.dimension.temperature && from.kind !== to.kind) {
    throw new ConversionError('incompatible_temperature_kind', 'Absolute temperatures and temperature differences cannot be mixed.', {
      from: from.id,
      to: to.id,
    });
  }

  const precision = options.precision ?? 40;
  if (!Number.isInteger(precision) || precision < 8 || precision > 100) {
    throw new ConversionError('invalid_value', 'Precision must be an integer from 8 to 100.');
  }
  const DecimalConstructor = Decimal.clone({ precision });
  {
    const input = parseDecimal(value, DecimalConstructor);
    const maxMagnitude = options.maxMagnitude === undefined
      ? undefined
      : parseDecimal(options.maxMagnitude, DecimalConstructor);
    if (maxMagnitude && maxMagnitude.isNegative()) {
      throw new ConversionError('invalid_value', 'Maximum magnitude must be non-negative.');
    }
    if (from.minimum && input.lessThan(new Decimal(from.minimum))) {
      throw new ConversionError('below_absolute_zero', `${from.label} cannot be below absolute zero.`, {
        unit: from.id,
        minimum: from.minimum,
      });
    }
    const canonical = input.plus(from.offset ?? noOffset ?? '0').times(from.scale);
    const result = canonical.dividedBy(to.scale).minus(to.offset ?? '0');
    if (maxMagnitude && result.abs().greaterThan(maxMagnitude)) {
      throw new ConversionError('result_out_of_range', 'Result exceeds the configured magnitude limit.');
    }
    const rounded = result.toSignificantDigits(precision);
    // Finite decimal constants approximate recurring factors such as 5/9.
    // Remove only an extremely small residue around an integer so exact
    // identities such as -40 °C = -40 °F remain readable.
    const nearestInteger = rounded.round();
    const normalized = rounded.minus(nearestInteger).abs().lt('1e-24') ? nearestInteger : rounded;
    return { value: normalized.toString(), from, to, dimension: from.dimension, precision };
  }
}

/** Compatibility helper for simple UI clients that need a numeric result. */
export function convertNumber(value: string | number, fromId: string, toId: string, options?: ConvertOptions): number {
  const result = Number(convertValue(value, fromId, toId, options).value);
  if (!Number.isFinite(result)) throw new ConversionError('result_out_of_range', 'Result cannot be represented as a JavaScript number.');
  return result;
}

export type ParsedExpression = {
  readonly dimension: Dimension;
  readonly scale: string;
  readonly kind: UnitKind;
  readonly source: string;
};

/**
 * Parse a bounded UCUM-shaped expression (`kg*m/s^2`). This intentionally
 * supports only multiplicative units and integer exponents; affine units are
 * rejected because multiplying an absolute temperature is ambiguous.
 */
export function parseUnitExpression(expression: string): ParsedExpression {
  const source = expression.trim();
  if (!source || source.length > 128 || /[^A-Za-z0-9_µ°²³./*^ -]/.test(source)) {
    throw new ConversionError('invalid_expression', 'Unit expression contains unsupported characters.');
  }
  const compact = source.replace(/[·\s]/g, '*').replace(/²/g, '^2').replace(/³/g, '^3');
  const parts = compact.split('/');
  if (parts.length > 2 || parts.some((part) => !part.trim())) throw new ConversionError('invalid_expression', 'Unit expression has invalid division.');
  const numeratorTerms = parts[0].split('*');
  const denominatorTerms = parts.length === 2 ? parts[1].split('*') : [];
  if (numeratorTerms.some((part) => !part.trim()) || denominatorTerms.some((part) => !part.trim())) {
    throw new ConversionError('invalid_expression', 'Unit expression has an empty term.');
  }
  const numerator = numeratorTerms;
  const denominator = denominatorTerms;

  const dimension: Record<string, number> = {};
  const ExpressionDecimal = Decimal.clone({ precision: 40 });
  let scale = new ExpressionDecimal(1);
  let kind: UnitKind = 'absolute';
  const apply = (term: string, sign: 1 | -1): void => {
    const match = /^(.+?)(?:\^([+-]?\d+))?$/.exec(term);
    if (!match) throw new ConversionError('invalid_expression', `Invalid unit term: ${term}.`);
    const unit = getUnit(match[1]);
    const exponent = Number(match[2] ?? '1') * sign;
    if (!Number.isInteger(exponent) || exponent < -16 || exponent > 16) throw new ConversionError('invalid_expression', 'Unit exponents must be integers between -16 and 16.');
    if (unit.offset && exponent !== 0) throw new ConversionError('invalid_expression', 'Absolute affine units cannot be used in compound expressions.');
    if (unit.kind === 'delta') kind = 'delta';
    for (const [name, value] of Object.entries(unit.dimension)) dimension[name] = (dimension[name] ?? 0) + value * exponent;
    // Apply the exponent to this term only. Raising the accumulated scale
    // would incorrectly re-exponentiate preceding numerator terms when a
    // denominator or powered term is encountered (for example kg*m/s^2).
    scale = scale.times(new ExpressionDecimal(unit.scale).pow(exponent));
  };
  numerator.forEach((term) => apply(term, 1));
  denominator.forEach((term) => apply(term, -1));
  return { dimension: normalizedDimension(dimension), scale: scale.toString(), kind, source };
}

export function formatValue(value: string | number, maximumFractionDigits = 12): string {
  const parsed = parseDecimal(value);
  if (!Number.isInteger(maximumFractionDigits) || maximumFractionDigits < 0 || maximumFractionDigits > 30) {
    throw new ConversionError('invalid_value', 'maximumFractionDigits must be between 0 and 30.');
  }
  return parsed.toDecimalPlaces(maximumFractionDigits).toFixed(maximumFractionDigits).replace(/(?:\.0+|(?<=\.[0-9]+)0+)$/, '').replace(/\.$/, '');
}

export type DisplayNumber = {
  /** Ungrouped text that parses back to the displayed value, such as `1234.5` or `6.2e-10`. */
  readonly plain: string;
  /** Grouped fixed-notation digits, or the mantissa when `exponent` is not null. */
  readonly significand: string;
  /** Power of ten for scientific display; null for fixed notation. */
  readonly exponent: number | null;
  /** True when rounding to the requested significant digits changed the value. */
  readonly rounded: boolean;
};

export type DisplayOptions = {
  /** Significant digits shown; defaults to 12. */
  readonly maximumSignificantDigits?: number;
  /** Separator between integer digit groups; defaults to a comma. */
  readonly groupSeparator?: string;
};

// Fixed notation stays readable from 1e-6 up to (but excluding) 1e15.
const SCIENTIFIC_BELOW_EXPONENT = -6;
const SCIENTIFIC_FROM_EXPONENT = 15;
const DisplayDecimal = Decimal.clone({ precision: 100 });

/**
 * Display-only rounding by significant digits. Fractional-digit rounding hides
 * small results (1 µm in miles becomes 0.0000000006), so values outside the
 * fixed range switch to a mantissa and power of ten instead.
 */
export function formatSignificant(value: string | number, options: DisplayOptions = {}): DisplayNumber {
  const digits = options.maximumSignificantDigits ?? 12;
  if (!Number.isInteger(digits) || digits < 1 || digits > 100) {
    throw new ConversionError('invalid_value', 'maximumSignificantDigits must be between 1 and 100.');
  }
  const separator = options.groupSeparator ?? ',';
  const parsed = parseDecimal(value, DisplayDecimal);
  if (parsed.isZero()) return { plain: '0', significand: '0', exponent: null, rounded: false };

  const rounded = parsed.toSignificantDigits(digits);
  const [mantissa, exponentText] = rounded.toExponential().split('e');
  const exponent = Number(exponentText);
  const changed = !rounded.equals(parsed);
  if (exponent < SCIENTIFIC_BELOW_EXPONENT || exponent >= SCIENTIFIC_FROM_EXPONENT) {
    return { plain: `${mantissa}e${exponent}`, significand: mantissa, exponent, rounded: changed };
  }

  const plain = rounded.toFixed();
  const [, sign, integer, fraction] = /^(-?)(\d+)(?:\.(\d+))?$/.exec(plain) ?? [];
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return { plain, significand: `${sign}${grouped}${fraction ? `.${fraction}` : ''}`, exponent: null, rounded: changed };
}

export type DeveloperErrorCode = 'invalid_input' | 'invalid_json' | 'invalid_base64' | 'unsupported_algorithm';

export class DeveloperTransformError extends Error {
  readonly code: DeveloperErrorCode;
  constructor(code: DeveloperErrorCode, message: string) {
    super(message);
    this.name = 'DeveloperTransformError';
    this.code = code;
  }
}

const MAX_DEVELOPER_INPUT = 1_000_000;
const assertText = (input: string, label: string): void => {
  if (typeof input !== 'string' || input.length > MAX_DEVELOPER_INPUT) {
    throw new DeveloperTransformError('invalid_input', `${label} must be a string of at most ${MAX_DEVELOPER_INPUT} characters.`);
  }
};

export const developer = {
  urlEncode(input: string): string { assertText(input, 'Input'); return encodeURIComponent(input); },
  urlDecode(input: string): string { assertText(input, 'Input'); try { return decodeURIComponent(input); } catch { throw new DeveloperTransformError('invalid_input', 'Input is not valid URL encoding.'); } },
  jsonPretty(input: string, space = 2): string { assertText(input, 'JSON'); if (!Number.isInteger(space) || space < 0 || space > 10) throw new DeveloperTransformError('invalid_input', 'Indent must be between 0 and 10.'); try { return JSON.stringify(JSON.parse(input), null, space); } catch { throw new DeveloperTransformError('invalid_json', 'Input is not valid JSON.'); } },
  jsonMinify(input: string): string { assertText(input, 'JSON'); try { return JSON.stringify(JSON.parse(input)); } catch { throw new DeveloperTransformError('invalid_json', 'Input is not valid JSON.'); } },
  base64Encode(input: string): string { assertText(input, 'Input'); if (typeof globalThis.btoa !== 'function') throw new DeveloperTransformError('invalid_base64', 'Base64 is unavailable in this runtime.'); const bytes = new TextEncoder().encode(input); let binary = ''; for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]); return globalThis.btoa(binary); },
  base64Decode(input: string): string { assertText(input, 'Input'); if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) throw new DeveloperTransformError('invalid_base64', 'Input is not valid standard Base64.'); try { const binary = globalThis.atob(input); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)); return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new DeveloperTransformError('invalid_base64', 'Input is not valid UTF-8 Base64.'); } },
};

export { Decimal };
