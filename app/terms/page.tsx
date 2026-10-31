import type { Metadata } from "next";
export const metadata: Metadata = { title: "Terms of Use — AI Studio", description: "Terms for using AI Studio's free logo generator and photo enhancer." };
export default function Terms() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-4xl font-bold italic">Terms of Use</h1>
      <p className="text-muted-fg dark:text-slate-300">Last updated: November 2026.</p>
      <h2 className="text-2xl font-bold">The service</h2>
      <p className="text-muted-fg dark:text-slate-300">AI Studio provides a free AI logo generator and photo enhancer. The free tier allows 10 AI generations per day per visitor. We may change limits or availability at any time.</p>
      <h2 className="text-2xl font-bold">Your responsibilities</h2>
      <p className="text-muted-fg dark:text-slate-300">Do not upload abusive or illegal content, and do not use the tools to infringe trademarks, copyrights or other rights. Logo prompts referencing existing brands, characters, celebrities or logos are refused. You are responsible for how you use generated logos and enhanced photos.</p>
      <h2 className="text-2xl font-bold">Generated content</h2>
      <p className="text-muted-fg dark:text-slate-300">Logos are generated as original geometry from your description. We do not guarantee that a generated logo is registrable as a trademark or free of all third-party claims; get independent legal advice before registering one.</p>
      <h2 className="text-2xl font-bold">Availability</h2>
      <p className="text-muted-fg dark:text-slate-300">The service is provided “as is”, without warranties. We are not liable for loss arising from use of the tools, including any reliance on an enhanced photo or generated logo.</p>
    </div>
  );
}
