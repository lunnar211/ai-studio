import type { Metadata } from "next";
export const metadata: Metadata = { title: "DMCA / Takedown", description: "How to report infringing content on AI Studio." };
export default function Dmca() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-4xl font-bold italic">DMCA &amp; Takedown Notices</h1>
      <p className="text-muted-fg dark:text-slate-300">Last updated: November 2026.</p>
      <h2 className="text-2xl font-bold">Reporting infringement</h2>
      <p className="text-muted-fg dark:text-slate-300">AI Studio generates original geometry and does not host a public gallery of user outputs, but if you believe any content on this site infringes your copyright or trademark, send a notice via the Contact page including: (1) identification of the work and the allegedly infringing material (URL and description), (2) your contact details, (3) a good-faith statement that the use is not authorised, and (4) a statement, under penalty of perjury, that the information is accurate and you are authorised to act for the rights holder.</p>
      <h2 className="text-2xl font-bold">What happens next</h2>
      <p className="text-muted-fg dark:text-slate-300">Valid notices are reviewed by an admin, the material is restricted where appropriate, and repeat infringers&apos; accounts may be suspended. Counter-notices follow the same channel. This page is a process description, not legal advice.</p>
    </div>
  );
}
