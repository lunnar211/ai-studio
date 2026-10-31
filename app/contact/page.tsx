import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";
export const metadata: Metadata = { title: "Contact AI Studio", description: "Contact AI Studio about the logo generator or photo enhancer." };
export default function Contact() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl font-bold italic">Contact</h1>
      <p className="mt-3 text-lg text-muted-fg dark:text-slate-300">
        Tell us what went wrong, what you would like added, or anything else about AI Studio.
        The form opens your email app with the message addressed to us — nothing is sent from this page itself.
      </p>
      <ContactForm />
    </div>
  );
}
