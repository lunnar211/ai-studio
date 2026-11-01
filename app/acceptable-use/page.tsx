import type { Metadata } from "next";
export const metadata: Metadata = { title: "Acceptable Use & Moderation Policy", description: "What is refused by AI Studio's moderation, and why." };
export default function AcceptableUse() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-4xl font-bold italic">Acceptable Use &amp; Moderation Policy</h1>
      <p className="text-muted-fg dark:text-slate-300">Last updated: November 2026.</p>
      <h2 className="text-2xl font-bold">Refused categories</h2>
      <ul className="list-disc space-y-2 pl-6 text-muted-fg dark:text-slate-300">
        <li><strong>Brands, characters, celebrities:</strong> prompts referencing existing brands, copyrighted characters, public figures or existing logos (about 90 terms plus trademark-copying phrases) are refused with a clear message.</li>
        <li><strong>Illegal content:</strong> counterfeiting, forged documents, phishing, malware, weapons and other illegal activity.</li>
        <li><strong>Sexual content:</strong> pornographic or sexually explicit prompts and uploads.</li>
        <li><strong>Abusive content:</strong> hate symbols, harassment and threatening content.</li>
      </ul>
      <h2 className="text-2xl font-bold">How enforcement works</h2>
      <p className="text-muted-fg dark:text-slate-300">Logo prompts are checked against a keyword blocklist before generation; refused prompts are recorded only as a category (never the prompt text) for abuse review. Photo uploads are validated by file type, magic bytes and size (max 10 MB); abusive or illegal uploads are refused where detected and are never stored or listed. Repeated abuse may lead to IP blocks or account suspension by an admin; every admin action is audit-logged.</p>
      <h2 className="text-2xl font-bold">Limits of this policy</h2>
      <p className="text-muted-fg dark:text-slate-300">The blocklist is a first-pass guard, not a legal opinion. Borderline prompts are refused so you can rephrase with an original concept. If you believe a refusal was wrong, contact us via the Contact page.</p>
    </div>
  );
}
