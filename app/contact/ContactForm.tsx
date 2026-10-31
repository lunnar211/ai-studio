"use client";
import { useState } from "react";
import { Alert, Label, TextInput, TextArea } from "@/components/ui/field";

export function ContactForm() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  if (!email) {
    return (
      <div className="mt-6"><Alert kind="info">
        Contact email not configured yet. The contact form will be enabled once an address is set.
        Please check back soon.
      </Alert></div>
    );
  }
  const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  const ready = Boolean(subject.trim() && message.trim());
  return (
    <form className="mt-6 border-2 border-line bg-white p-6 dark:bg-slate-900" aria-label="Contact form">
      <div>
        <Label htmlFor="contact-subject">Subject</Label>
        <TextInput id="contact-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} required placeholder="Logo generator feedback" />
      </div>
      <div className="mt-4">
        <Label htmlFor="contact-message">Message</Label>
        <TextArea id="contact-message" rows={6} value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} required placeholder="What happened, and what would help?" />
      </div>
      <a
        href={ready ? mailto : undefined}
        aria-disabled={!ready}
        onClick={(e) => { if (!ready) e.preventDefault(); }}
        className={`mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[3px] border-2 border-brand px-5 py-2.5 font-semibold ${ready ? "bg-brand text-white hover:bg-brand-dark" : "cursor-not-allowed border-line bg-slate-100 text-slate-400"}`}
      >
        Open email to send
      </a>
      <p className="mt-3 text-sm text-muted-fg dark:text-slate-400">This opens your own email app addressed to {email}. Nothing is sent until you press send there.</p>
    </form>
  );
}
