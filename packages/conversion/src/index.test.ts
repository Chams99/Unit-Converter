import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversionError,
  convertValue,
  developer,
  formatSignificant,
  formatValue,
  parseUnitExpression,
} from './index';

describe('conversion core', () => {
  it('converts exact SI relationships without using formatted UI text', () => {
    assert.equal(convertValue('2.54', 'centimeter', 'inch').value, '1');
    assert.equal(convertValue('1', 'kilometer', 'meter').value, '1000');
    assert.equal(convertValue('1', 'gallon-us', 'liter').value, '3.785411784');
  });

  it('handles affine temperature and protects absolute zero', () => {
    assert.equal(convertValue('32', 'fahrenheit', 'celsius').value, '0');
    assert.equal(convertValue('-40', 'celsius', 'fahrenheit').value, '-40');
    assert.equal(convertValue('0', 'celsius', 'kelvin').value, '273.15');
    assert.equal(convertValue('0', 'kelvin', 'celsius').value, '-273.15');
    assert.equal(convertValue('10', 'delta-fahrenheit', 'delta-celsius').value, '5.555555555555555555555555556');
    assert.doesNotThrow(() => convertValue('-273.15', 'celsius', 'kelvin'));
    assert.throws(() => convertValue('-273.1501', 'celsius', 'kelvin'), ConversionError);
    assert.throws(() => convertValue('-1', 'kelvin', 'celsius'), ConversionError);
    assert.throws(() => convertValue('10', 'celsius', 'delta-celsius'), ConversionError);
  });

  it('rejects incompatible dimensions and malformed numbers', () => {
    assert.throws(() => convertValue('1', 'meter', 'second'), ConversionError);
    assert.doesNotThrow(() => convertValue('1e999', 'meter', 'foot'));
    assert.throws(() => convertValue('1,2', 'meter', 'foot'), ConversionError);
  });

  it('parses bounded compound dimensions', () => {
    assert.equal(convertValue('1', 'm^3', 'liter').value, '1000');
    assert.deepEqual(parseUnitExpression('m^3').dimension, { length: 3 });
    const expression = parseUnitExpression('kg*m/s^2');
    assert.deepEqual(expression.dimension, { mass: 1, length: 1, time: -2 });
    assert.equal(expression.scale, '1000');
    assert.deepEqual(parseUnitExpression('km/h').dimension, { length: 1, time: -1 });
    assert.equal(parseUnitExpression('km/h').scale, '0.2777777777777777777777777777777777777778');
    assert.throws(() => parseUnitExpression('°C/s'), ConversionError);
  });

  it('keeps case-sensitive data symbols and rejects empty compound terms', () => {
    assert.equal(convertValue(8, 'bit', 'byte').value, '1');
    assert.equal(convertValue(1, 'B', 'bit').value, '8');
    assert.equal(convertValue(1, 'kB', 'byte').value, '1000');
    assert.throws(() => convertValue(1, 'byte', 'second'), ConversionError);
    assert.throws(() => parseUnitExpression('kg/*s'), ConversionError);
    assert.throws(() => parseUnitExpression('kg/ s'), ConversionError);
  });

  it('validates magnitude limits as decimal input', () => {
    assert.throws(() => convertValue(1, 'meter', 'meter', { maxMagnitude: 'not-a-number' }), ConversionError);
    assert.throws(() => convertValue(1, 'meter', 'meter', { maxMagnitude: '-1' }), ConversionError);
  });

  it('keeps calculation and display formatting separate', () => {
    assert.equal(formatValue('1.234567890123456789', 6), '1.234568');
    assert.equal(formatValue('100.000', 4), '100');
  });

  it('formats display values by significant digits with grouping', () => {
    assert.deepEqual(formatSignificant('0.001'), { plain: '0.001', significand: '0.001', exponent: null, rounded: false });
    assert.deepEqual(formatSignificant('222222252.4222222202'), { plain: '222222252.422', significand: '222,222,252.422', exponent: null, rounded: true });
    assert.equal(formatSignificant('-1234567.5').significand, '-1,234,567.5');
    assert.equal(formatSignificant('-40').plain, '-40');
    assert.equal(formatSignificant('0').plain, '0');
    assert.equal(formatSignificant('-0').plain, '0');
    assert.equal(formatSignificant('2.5', { maximumSignificantDigits: 1 }).plain, '3');
    assert.equal(formatSignificant('999999999999.9999').significand, '1,000,000,000,000');
    assert.equal(formatSignificant('1234.5', { groupSeparator: ' ' }).significand, '1 234.5');
  });

  it('switches to scientific display outside the fixed range', () => {
    const tiny = formatSignificant(convertValue('1', 'micrometer', 'mile').value);
    assert.deepEqual(tiny, { plain: '6.21371192237e-10', significand: '6.21371192237', exponent: -10, rounded: true });
    assert.equal(formatSignificant('0.000001').plain, '0.000001');
    assert.equal(formatSignificant('0.0000001').exponent, -7);
    assert.equal(formatSignificant('123456789012345').significand, '123,456,789,012,000');
    // Rounding fifteen nines to twelve digits carries into 1e15, the first scientific value.
    assert.equal(formatSignificant('999999999999999').plain, '1e15');
    assert.deepEqual(formatSignificant('1234567890123456789'), { plain: '1.23456789012e18', significand: '1.23456789012', exponent: 18, rounded: true });
    assert.equal(formatSignificant('-1e999').plain, '-1e999');
  });

  it('shows full calculation precision on request and rejects bad options', () => {
    const third = convertValue('1', 'foot', 'yard').value;
    assert.equal(formatSignificant(third, { maximumSignificantDigits: 40 }).rounded, false);
    assert.equal(formatSignificant(third).plain, '0.333333333333');
    assert.throws(() => formatSignificant('1', { maximumSignificantDigits: 0 }), ConversionError);
    assert.throws(() => formatSignificant('1,000'), ConversionError);
  });
});

describe('developer transforms', () => {
  it('round-trips UTF-8 Base64 and JSON', () => {
    const encoded = developer.base64Encode('مرحبا');
    assert.equal(developer.base64Decode(encoded), 'مرحبا');
    assert.equal(developer.jsonMinify('{ "a": 1 }'), '{"a":1}');
  });

  it('reports malformed input', () => {
    assert.throws(() => developer.urlDecode('%'));
    assert.throws(() => developer.base64Decode('not base64!'));
    assert.throws(() => developer.jsonMinify('{'));
  });
});
