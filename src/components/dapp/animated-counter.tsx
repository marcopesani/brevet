"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: string;
  className?: string;
  duration?: number;
}

/**
 * Animated digit counter with odometer-like roll-up effect.
 * Each digit animates independently from 0 to target value.
 */
export function AnimatedCounter({
  value,
  className = "",
  duration = 800,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState("0.00");
  const prevValueRef = useRef(value);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const startTime = performance.now();
    const startValue = parseFloat(prevValueRef.current) || 0;
    const targetValue = parseFloat(value) || 0;

    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Spring easing: easeOutBack for satisfying feel
      const easeOutBack = (x: number): number => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
      };

      const easedProgress = easeOutBack(progress);
      const currentValue = startValue + (targetValue - startValue) * easedProgress;

      setDisplayValue(currentValue.toFixed(2));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        prevValueRef.current = value;
      }
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span className={`tabular-nums tracking-tight ${className}`}>
      {displayValue}
    </span>
  );
}

/**
 * Character-by-character animated counter for a more granular effect.
 * Each digit column scrolls vertically like a slot machine.
 */
export function SlotMachineCounter({
  value,
  className = "",
  prefix = "$",
}: {
  value: string;
  className?: string;
  prefix?: string;
}) {
  const digits = value.split("");

  return (
    <span className={`inline-flex items-baseline ${className}`}>
      <span className="mr-1 text-2xl text-muted-foreground">{prefix}</span>
      <span className="flex overflow-hidden">
        {digits.map((digit, index) => (
          <Digit
            key={`${index}-${digit}`}
            target={digit}
            delay={index * 80}
          />
        ))}
      </span>
    </span>
  );
}

function Digit({ target, delay }: { target: string; delay: number }) {
  const [current, setCurrent] = useState("0");
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (target === current) return;

    // Handle non-numeric characters immediately
    if (!/[0-9]/.test(target)) {
      setCurrent(target);
      return;
    }

    setIsAnimating(true);
    const targetNum = parseInt(target, 10);
    const startNum = parseInt(current, 10) || 0;

    const timeout = setTimeout(() => {
      const duration = 400;
      const steps = 10;
      const stepDuration = duration / steps;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        if (step >= steps) {
          setCurrent(target);
          setIsAnimating(false);
          clearInterval(interval);
        } else {
          // Spin through numbers
          const progress = step / steps;
          const spin = Math.floor(progress * 10);
          setCurrent(String((startNum + spin) % 10));
        }
      }, stepDuration);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [target, delay, current]);

  return (
    <span
      className={`inline-block transition-transform duration-100 ${
        isAnimating ? "animate-digit-roll" : ""
      }`}
      style={{
        width: target === "." ? "0.3em" : "0.6em",
        textAlign: "center",
      }}
    >
      {current}
    </span>
  );
}
