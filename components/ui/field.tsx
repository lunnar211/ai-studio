import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-base font-semibold text-slate-900 dark:text-white">
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "min-h-[44px] w-full rounded-[3px] border-2 border-line bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 dark:bg-slate-900 dark:text-white",
        props.className
      )}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-[3px] border-2 border-line bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 dark:bg-slate-900 dark:text-white",
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "min-h-[44px] w-full rounded-[3px] border-2 border-line bg-white px-3 py-2 text-base text-slate-900 dark:bg-slate-900 dark:text-white",
        props.className
      )}
    />
  );
}

export function Alert({ kind, children }: { kind: "error" | "info" | "success"; children: React.ReactNode }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "rounded-[3px] border-2 px-4 py-3 text-base",
        kind === "error" && "border-destructive bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
        kind === "info" && "border-accent bg-cyan-50 text-cyan-950 dark:bg-cyan-950 dark:text-cyan-100",
        kind === "success" && "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"
      )}
    >
      {children}
    </div>
  );
}
