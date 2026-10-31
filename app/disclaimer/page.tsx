import type { Metadata } from "next";
export const metadata: Metadata = { title: "Disclaimer — AI Studio", description: "AI Studio disclaimer: generated logos and enhanced photos carry no guarantee." };
export default function Disclaimer() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-4xl font-bold italic">Disclaimer</h1>
      <p className="text-muted-fg dark:text-slate-300">AI-generated logos and enhanced photos are provided for general use, not professional advice. A generated logo is not legal advice on trademark availability, and an enhanced photo is not a certified or forensic restoration — enhancement sharpens an image but cannot prove what was originally there. Results vary with the quality of the input. No result is guaranteed to meet a specific commercial, legal or print standard; check outputs before using them for anything important.</p>
      <p className="text-muted-fg dark:text-slate-300">Standard-quality enhancement is not AI upscaling and is labelled as such wherever it appears.</p>
    </div>
  );
}
