import { Clock, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface HistoryItem {
  id: string;
  value: number;
  fromUnit: string;
  toUnit: string;
  result: number;
  category: string;
  timestamp: number;
}

interface ConversionHistoryProps {
  history: HistoryItem[];
  onClear: () => void;
  onSelect: (item: HistoryItem) => void;
}

export function ConversionHistory({ history, onClear, onSelect }: ConversionHistoryProps) {
  if (history.length === 0) {
    return (
      <Card className="p-6 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Conversion History</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">
          No conversions yet. Start converting to see your history here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Conversion History</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>

      <div className="space-y-2">
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={cn(
              "w-full text-left p-3 rounded-lg border border-border/50",
              "hover:border-primary/50 hover:bg-muted/50 transition-all",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {item.value.toLocaleString()} {item.fromUnit} → {item.result.toLocaleString()} {item.toUnit}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {item.category}
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(item.timestamp).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
