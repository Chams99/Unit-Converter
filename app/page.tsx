'use client'

import { useState, useCallback, useMemo } from 'react'
import { Calculator } from 'lucide-react'
import { UnitConverter } from '@/components/UnitConverter'
import { ConversionHistory, type HistoryItem } from '@/components/ConversionHistory'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function HomePage() {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<{
    value: number;
    fromUnit: string;
    toUnit: string;
    category: string;
  } | null>(null)

  const handleConversion = useCallback((conversion: {
    value: number
    fromUnit: string
    toUnit: string
    result: number
    category: string
  }) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      ...conversion,
    }

    setHistory((prev) => {
      // Remove duplicates and keep last 10
      const filtered = prev.filter(
        (item) => 
          item.fromUnit !== newItem.fromUnit ||
          item.toUnit !== newItem.toUnit ||
          item.value !== newItem.value
      )
      return [newItem, ...filtered].slice(0, 10)
    })

    // Clear selected history item when new conversion is made
    setSelectedHistoryItem(null)
  }, [])

  const handleClearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const handleSelectHistory = useCallback((item: HistoryItem) => {
    setSelectedHistoryItem({
      value: item.value,
      fromUnit: item.fromUnit,
      toUnit: item.toUnit,
      category: item.category,
    });
  }, [])

  // Memoize the supported units data to prevent re-renders
  const supportedUnitsData = useMemo(() => [
    {
      title: 'Length',
      units: ['Meters', 'Kilometers', 'Miles', 'Feet', 'Inches'],
    },
    {
      title: 'Volume',
      units: ['Liters', 'Milliliters', 'Gallons', 'Cups'],
    },
    {
      title: 'Weight',
      units: ['Grams', 'Kilograms', 'Pounds', 'Ounces'],
    },
    {
      title: 'Energy',
      units: ['Calories', 'Kilocalories', 'Kilojoules'],
    },
    {
      title: 'Temperature',
      units: ['Celsius', 'Fahrenheit', 'Kelvin'],
    },
  ], [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-elegant">
                <Calculator className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Unit Converter</h1>
                <p className="text-xs text-muted-foreground">Convert anything, instantly</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
              Universal Unit Converter
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Convert between length, volume, weight, energy, and temperature units with precision
            </p>
          </div>

          {/* Converter and History Grid */}
          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            <div className="space-y-6">
              <UnitConverter 
                onConversion={handleConversion} 
                selectedHistoryItem={selectedHistoryItem}
              />
            </div>

            <div className="space-y-6">
              <ConversionHistory
                history={history}
                onClear={handleClearHistory}
                onSelect={handleSelectHistory}
                selectedHistoryItem={selectedHistoryItem}
              />

              {/* Features Card */}
              <div className="bg-gradient-to-br from-accent/10 to-accent/5 rounded-lg p-6 border border-accent/20">
                <h3 className="font-semibold text-foreground mb-3">Features</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Real-time conversion as you type
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Click history to reuse conversions
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Copy results to clipboard
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Dark mode support
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Supported Units */}
          <div className="mt-12 md:mt-16">
            <h3 className="text-2xl font-bold text-center text-foreground mb-8">
              Supported Units
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {supportedUnitsData.map((category) => (
                <div
                  key={category.title}
                  className="bg-card rounded-lg p-5 border border-border/50 hover:border-primary/30 transition-colors"
                >
                  <h4 className="font-semibold text-foreground mb-3">{category.title}</h4>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {category.units.map((unit) => (
                      <li key={unit}>{unit}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-16 py-8 bg-card/30">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Built with precision • Converts instantly • Works everywhere</p>
        </div>
      </footer>
    </div>
  )
}
