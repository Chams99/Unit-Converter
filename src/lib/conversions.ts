// Comprehensive unit conversion utilities

export type Category = 'length' | 'volume' | 'weight' | 'energy' | 'temperature';

export interface Unit {
  value: string;
  label: string;
}

export const categories: Record<Category, { label: string; units: Unit[] }> = {
  length: {
    label: 'Length',
    units: [
      { value: 'meter', label: 'Meters (m)' },
      { value: 'kilometer', label: 'Kilometers (km)' },
      { value: 'centimeter', label: 'Centimeters (cm)' },
      { value: 'millimeter', label: 'Millimeters (mm)' },
      { value: 'mile', label: 'Miles (mi)' },
      { value: 'yard', label: 'Yards (yd)' },
      { value: 'foot', label: 'Feet (ft)' },
      { value: 'inch', label: 'Inches (in)' },
    ],
  },
  volume: {
    label: 'Volume',
    units: [
      { value: 'liter', label: 'Liters (L)' },
      { value: 'milliliter', label: 'Milliliters (mL)' },
      { value: 'gallon', label: 'Gallons (gal)' },
      { value: 'cup', label: 'Cups' },
      { value: 'tablespoon', label: 'Tablespoons (tbsp)' },
      { value: 'teaspoon', label: 'Teaspoons (tsp)' },
    ],
  },
  weight: {
    label: 'Weight / Mass',
    units: [
      { value: 'gram', label: 'Grams (g)' },
      { value: 'kilogram', label: 'Kilograms (kg)' },
      { value: 'milligram', label: 'Milligrams (mg)' },
      { value: 'pound', label: 'Pounds (lb)' },
      { value: 'ounce', label: 'Ounces (oz)' },
    ],
  },
  energy: {
    label: 'Energy',
    units: [
      { value: 'calorie', label: 'Calories (cal)' },
      { value: 'kilocalorie', label: 'Kilocalories (kcal)' },
      { value: 'kilojoule', label: 'Kilojoules (kJ)' },
    ],
  },
  temperature: {
    label: 'Temperature',
    units: [
      { value: 'celsius', label: 'Celsius (°C)' },
      { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
      { value: 'kelvin', label: 'Kelvin (K)' },
    ],
  },
};

// Base conversion rates (to standard unit)
const conversionRates: Record<string, Record<string, number>> = {
  length: {
    meter: 1,
    kilometer: 0.001,
    centimeter: 100,
    millimeter: 1000,
    mile: 0.000621371,
    yard: 1.09361,
    foot: 3.28084,
    inch: 39.3701,
  },
  volume: {
    liter: 1,
    milliliter: 1000,
    gallon: 0.264172,
    cup: 4.22675,
    tablespoon: 67.628,
    teaspoon: 202.884,
  },
  weight: {
    gram: 1,
    kilogram: 0.001,
    milligram: 1000,
    pound: 0.00220462,
    ounce: 0.035274,
  },
  energy: {
    calorie: 1,
    kilocalorie: 0.001,
    kilojoule: 0.004184,
  },
};

export function convert(
  value: number,
  fromUnit: string,
  toUnit: string,
  category: Category
): number {
  // Special handling for temperature
  if (category === 'temperature') {
    return convertTemperature(value, fromUnit, toUnit);
  }

  // Standard conversion via base unit
  const rates = conversionRates[category];
  if (!rates || !rates[fromUnit] || !rates[toUnit]) {
    return value;
  }

  // Convert to base unit, then to target unit
  const baseValue = value / rates[fromUnit];
  return baseValue * rates[toUnit];
}

function convertTemperature(value: number, from: string, to: string): number {
  if (from === to) return value;

  // Convert to Celsius first
  let celsius: number;
  switch (from) {
    case 'celsius':
      celsius = value;
      break;
    case 'fahrenheit':
      celsius = (value - 32) * (5 / 9);
      break;
    case 'kelvin':
      celsius = value - 273.15;
      break;
    default:
      return value;
  }

  // Convert from Celsius to target
  switch (to) {
    case 'celsius':
      return celsius;
    case 'fahrenheit':
      return celsius * (9 / 5) + 32;
    case 'kelvin':
      return celsius + 273.15;
    default:
      return value;
  }
}

export function formatResult(value: number): string {
  // Format with appropriate precision
  if (Math.abs(value) < 0.001) {
    return value.toExponential(4);
  }
  if (Math.abs(value) > 1000000) {
    return value.toExponential(4);
  }
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  });
}
