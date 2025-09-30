'use client'

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { useEffect, useState, useRef } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = (event: React.MouseEvent<HTMLButtonElement>) => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    
    // Trigger ripple animation
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 700);
    
    // Check if browser supports View Transitions API
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      const x = event.clientX;
      const y = event.clientY;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      // Create circular reveal animation
      const transition = (document as any).startViewTransition(() => {
        setTheme(newTheme);
      });

      transition.ready.then(() => {
        const clipPath = [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ];

        document.documentElement.animate(
          {
            clipPath: clipPath,
          },
          {
            duration: 700,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          }
        );
      });
    } else {
      // Fallback for browsers without View Transitions API
      setTheme(newTheme);
    }
  };

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="rounded-full h-10 w-10"
        disabled
      >
        <Sun className="h-5 w-5" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <Button
      ref={buttonRef}
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="rounded-full h-10 w-10 transition-all duration-300 hover:scale-110 hover:rotate-12 active:scale-95 relative overflow-visible"
      style={{
        animation: isAnimating ? 'theme-ripple 0.7s ease-out' : undefined,
      }}
    >
      {theme === 'light' ? (
        <Moon 
          className="h-5 w-5 transition-all duration-500 hover:rotate-[-15deg]"
          style={{
            animation: isAnimating ? 'theme-glow 0.7s ease-out' : undefined,
          }}
        />
      ) : (
        <Sun 
          className="h-5 w-5 transition-all duration-500 rotate-0 hover:rotate-180"
          style={{
            animation: isAnimating ? 'theme-glow 0.7s ease-out' : undefined,
          }}
        />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
