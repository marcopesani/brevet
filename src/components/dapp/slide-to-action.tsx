"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideToActionProps {
  onComplete: () => void;
  label?: string;
  completedLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  colorClass?: string;
}

/**
 * Slide-to-action gesture primitive.
 * Inspired by iPhone unlock and iOS camera swipe gestures.
 */
export function SlideToAction({
  onComplete,
  label = "Slide to Approve",
  completedLabel = "Approved",
  isLoading = false,
  disabled = false,
  className,
  colorClass = "bg-green-500",
}: SlideToActionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startProgressRef = useRef(0);

  const threshold = 0.85; // 85% of the track

  const reset = useCallback(() => {
    setProgress(0);
    setIsDragging(false);
  }, []);

  // Reset when not loading
  useEffect(() => {
    if (!isLoading && isComplete) {
      setIsComplete(false);
      reset();
    }
  }, [isLoading, isComplete, reset]);

  function handleStart(clientX: number) {
    if (disabled || isLoading || isComplete) return;

    setIsDragging(true);
    startXRef.current = clientX;
    startProgressRef.current = progress;

    // Haptic feedback
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(5);
    }
  }

  function handleMove(clientX: number) {
    if (!isDragging || !trackRef.current) return;

    const trackWidth = trackRef.current.offsetWidth;
    const thumbWidth = thumbRef.current?.offsetWidth ?? 56;
    const maxProgress = trackWidth - thumbWidth - 8; // 8px padding

    const delta = clientX - startXRef.current;
    const newProgress = Math.max(
      0,
      Math.min(maxProgress, startProgressRef.current + delta),
    );

    const normalizedProgress = newProgress / maxProgress;
    setProgress(normalizedProgress);

    // Haptic feedback at threshold
    if (normalizedProgress >= threshold && progress < threshold) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(5);
      }
    }
  }

  function handleEnd() {
    if (!isDragging) return;

    setIsDragging(false);

    if (progress >= threshold) {
      setProgress(1);
      setIsComplete(true);
      onComplete();

      // Success haptic
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([10, 50, 10]);
      }
    } else {
      // Spring back
      setProgress(0);
    }
  }

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  const onTouchEnd = () => {
    handleEnd();
  };

  // Mouse events
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX);
    };

    const handleMouseUp = () => {
      handleEnd();
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, progress, onComplete]);

  const trackWidth = trackRef.current?.offsetWidth ?? 300;
  const thumbWidth = thumbRef.current?.offsetWidth ?? 56;
  const maxTranslate = trackWidth - thumbWidth - 8;
  const translateX = progress * maxTranslate;

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-14 w-full cursor-pointer touch-none select-none overflow-hidden rounded-full",
        "bg-muted transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
    >
      {/* Progress background */}
      <div
        className={cn(
          "absolute left-0 top-0 h-full rounded-full transition-all duration-100",
          colorClass,
          isComplete && "bg-green-500",
        )}
        style={{ width: `${Math.max(0, progress * 100 - 5)}%` }}
      />

      {/* Label */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center text-sm font-medium transition-colors",
          progress > 0.3 && "text-white",
          isComplete && "text-white",
        )}
      >
        {isComplete
          ? completedLabel
          : isLoading
            ? "Processing..."
            : label}
      </div>

      {/* Thumb */}
      <div
        ref={thumbRef}
        className={cn(
          "absolute left-1 top-1 h-12 w-12 rounded-full",
          "flex items-center justify-center",
          "bg-white shadow-lg transition-transform duration-75",
          isDragging && "scale-110",
          isComplete && "bg-green-500 text-white",
        )}
        style={{ transform: `translateX(${translateX}px)` }}
      >
        {isComplete ? (
          <Check className="h-5 w-5" />
        ) : isLoading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        ) : (
          <svg
            className="h-5 w-5 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

/**
 * Simpler button variant for when slide is not desired
 */
export function SlideButton({
  onClick,
  label,
  variant = "primary",
  disabled = false,
  isLoading = false,
}: {
  onClick: () => void;
  label: string;
  variant?: "primary" | "danger";
  disabled?: boolean;
  isLoading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "flex h-12 w-full items-center justify-center rounded-full font-medium",
        "transition-all active:scale-95",
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "danger" &&
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        (disabled || isLoading) && "cursor-not-allowed opacity-50",
      )}
    >
      {isLoading ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        label
      )}
    </button>
  );
}
