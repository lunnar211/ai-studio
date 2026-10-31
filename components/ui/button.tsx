import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "danger";
};

export function Button({ variant = "primary", className, ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] border-2 px-5 py-2.5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "border-brand bg-brand text-white hover:bg-brand-dark",
        variant === "secondary" && "border-accent bg-accent text-white hover:bg-accent-dark",
        variant === "outline" && "border-line bg-white text-slate-900 hover:border-brand",
        variant === "danger" && "border-destructive bg-destructive text-white",
        className
      )}
      {...props}
    />
  );
}
