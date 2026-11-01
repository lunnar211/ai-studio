"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { usePrefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";

// Motion's own button prop type (not React's ButtonHTMLAttributes):
// the two differ on a few React 19 form props, and spreading the
// React type into motion.button fails type-checking.
type Props = Omit<HTMLMotionProps<"button">, "ref"> & {
  variant?: "primary" | "secondary" | "outline" | "danger";
};

// Site-wide button motion (Motion gesture showcase, 2026-11-01):
// a subtle press answer — hover grows 2%, tap shrinks 2%.
// Transform-only, so no layout shift. Disabled buttons and
// reduced-motion users get no motion at all.
export function Button({ variant = "primary", className, disabled, ...props }: Props) {
  const reduce = usePrefersReducedMotion();
  const animate = !reduce && !disabled;
  return (
    <motion.button
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] border-2 px-5 py-2.5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "border-brand-dark bg-brand-dark text-white hover:bg-brand-dark",
        variant === "secondary" && "border-accent-dark bg-accent-dark text-white hover:bg-accent-dark",
        variant === "outline" && "border-line bg-white text-slate-900 hover:border-brand",
        variant === "danger" && "border-destructive bg-destructive text-white",
        className
      )}
      disabled={disabled}
      whileHover={animate ? { scale: 1.02 } : undefined}
      whileTap={animate ? { scale: 0.98 } : undefined}
      {...props}
    />
  );
}
