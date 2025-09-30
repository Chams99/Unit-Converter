import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { ArrowLeftRight, Copy, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { categories, convert, formatResult, type Category } from '@/lib/conversions';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';

interface UnitConverterProps {
  onConversion: (conversion: {
    value: number;
    fromUnit: string;
    toUnit: string;
    result: number;
    category: string;
  }) => void;
  selectedHistoryItem?: {
    value: number;
    fromUnit: string;
    toUnit: string;
    category: string;
  } | null;
}

const UnitConverter = memo(function UnitConverter({ onConversion, selectedHistoryItem }: UnitConverterProps) {
  const [category, setCategory] = useState<Category>('length');
  const [inputValue, setInputValue] = useState('');
  const [fromUnit, setFromUnit] = useState('meter');
  const [toUnit, setToUnit] = useState('kilometer');
  const [result, setResult] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Debounce input value for better performance
  const debouncedInputValue = useDebounce(inputValue, 300);

  // Memoize current units to prevent unnecessary re-renders
  const currentUnits = useMemo(() => categories[category].units, [category]);

  // Update default units when category changes
  useEffect(() => {
    if (currentUnits.length >= 2) {
      setFromUnit(currentUnits[0].value);
      setToUnit(currentUnits[1].value);
    }
    setResult(null);
  }, [category, currentUnits]);

  // Populate converter when history item is selected
  useEffect(() => {
    if (selectedHistoryItem) {
      setCategory(selectedHistoryItem.category as Category);
      setInputValue(selectedHistoryItem.value.toString());
      setFromUnit(selectedHistoryItem.fromUnit);
      setToUnit(selectedHistoryItem.toUnit);
    }
  }, [selectedHistoryItem]);

  // Debounced conversion with useMemo
  const convertedResult = useMemo(() => {
    const numValue = parseFloat(debouncedInputValue);
    if (!isNaN(numValue) && debouncedInputValue !== '') {
      return convert(numValue, fromUnit, toUnit, category);
    }
    return null;
  }, [debouncedInputValue, fromUnit, toUnit, category]);

  // Update result when conversion changes
  useEffect(() => {
    setResult(convertedResult);
    
    if (convertedResult !== null) {
      const numValue = parseFloat(debouncedInputValue);
      onConversion({
        value: numValue,
        fromUnit,
        toUnit,
        result: convertedResult,
        category,
      });
    }
  }, [convertedResult, debouncedInputValue, fromUnit, toUnit, category, onConversion]);

  const handleSwapUnits = useCallback(() => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  }, [fromUnit, toUnit]);

  const handleCopyResult = useCallback(async () => {
    if (result !== null) {
      await navigator.clipboard.writeText(formatResult(result));
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Result copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result, toast]);

  // Memoize category options to prevent re-renders
  const categoryOptions = useMemo(() => 
    Object.entries(categories).map(([key, { label }]) => (
      <SelectItem key={key} value={key}>
        {label}
      </SelectItem>
    )), []);

  // Memoize unit options
  const unitOptions = useMemo(() => 
    currentUnits.map((unit) => (
      <SelectItem key={unit.value} value={unit.value}>
        {unit.label}
      </SelectItem>
    )), [currentUnits]);

  return (
    <Card className="p-6 md:p-8 bg-gradient-to-br from-card to-card/80 backdrop-blur-sm shadow-card">
      {/* Category Selection */}
      <div className="mb-6">
        <Label htmlFor="category" className="text-sm font-medium mb-2 block">
          Category
        </Label>
        <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
          <SelectTrigger id="category" className="w-full h-12 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {categoryOptions}
          </SelectContent>
        </Select>
      </div>

      {/* Input Value */}
      <div className="mb-6">
        <Label htmlFor="input-value" className="text-sm font-medium mb-2 block">
          Value
        </Label>
        <Input
          id="input-value"
          type="number"
          placeholder="Enter value"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="h-12 text-lg bg-background"
          step="any"
        />
      </div>

      {/* From Unit */}
      <div className="mb-4">
        <Label htmlFor="from-unit" className="text-sm font-medium mb-2 block">
          From
        </Label>
        <Select value={fromUnit} onValueChange={setFromUnit}>
          <SelectTrigger id="from-unit" className="w-full h-12 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {unitOptions}
          </SelectContent>
        </Select>
      </div>

      {/* Swap Button */}
      <div className="flex justify-center my-4">
        <Button
          variant="outline"
          size="icon"
          onClick={handleSwapUnits}
          className={cn(
            "h-10 w-10 rounded-full border-2 border-primary/20",
            "hover:border-primary hover:bg-primary/10",
            "transition-all duration-300 hover:rotate-180"
          )}
        >
          <ArrowLeftRight className="h-5 w-5" />
        </Button>
      </div>

      {/* To Unit */}
      <div className="mb-6">
        <Label htmlFor="to-unit" className="text-sm font-medium mb-2 block">
          To
        </Label>
        <Select value={toUnit} onValueChange={setToUnit}>
          <SelectTrigger id="to-unit" className="w-full h-12 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {unitOptions}
          </SelectContent>
        </Select>
      </div>

      {/* Result */}
      {result !== null && (
        <div className={cn(
          "p-6 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5",
          "border-2 border-primary/20",
          "animate-in fade-in slide-in-from-bottom-2 duration-300"
        )}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground mb-1">Result</p>
              <p className="text-2xl md:text-3xl font-bold text-primary truncate">
                {formatResult(result)}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyResult}
              className="h-10 w-10 shrink-0"
            >
              {copied ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <Copy className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
});

export { UnitConverter };
