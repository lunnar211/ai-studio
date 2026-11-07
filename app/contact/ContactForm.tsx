"use client";
import { useState } from "react";
import { Alert, Label, TextInput, TextArea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

// Posts to the admin support inbox (/api/contact). If the inbox is not
// configured (503), shows a plain inbox-down notice and points at the
// mailto link when a contact address is published — never invents one.
export function ContactForm() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState("");
  const [sent, setSent] = useState(false);
  const ready = Boolean(name.trim() && from.trim() && subject.trim() && message.trim());
  // The mailto fallback (only when a contact address is published —
  // never invent one). The form still holds the user's text, so a
  // failed send loses nothing.
  const mailto = email ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}` : "";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email: from, subject, message }),
    });
    if (res.ok) {
      setSent(true);
      return;
    }
    const data = await res.json().catch(() => ({}));
    // 503 = the support inbox is not set up yet: say so plainly, and
    // point at the email link when one exists. Never point at an email
    // link that does not exist, and never invent an address.
    if (res.status === 503) {
      setState(
        mailto
          ? "The support inbox is not set up right now, so your message could not be saved. Please send it with the email link below instead — the form still holds your text."
          : "The support inbox is not set up right now, so your message could not be saved. Please try again later — nothing was sent."
      );
      return;
    }
    setState(data.error || "Could not send right now. Please try again later.");
  }
  if (sent) {
    return (
      <div className="mt-6"><Alert kind="success">
        Message received. It is now in the support inbox and an admin will reply from there.
        {email ? " You can also email directly if you prefer." : ""}
      </Alert></div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-6 border-2 border-line bg-white p-6 dark:bg-slate-900" aria-label="Contact form">
      {state && <Alert kind="error">{state}</Alert>}
      <div>
        <Label htmlFor="contact-name">Your name</Label>
        <TextInput id="contact-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="mt-4">
        <Label htmlFor="contact-email">Your email</Label>
        <TextInput id="contact-email" type="email" value={from} maxLength={200} onChange={(e) => setFrom(e.target.value)} required />
      </div>
      <div className="mt-4">
        <Label htmlFor="contact-subject">Subject</Label>
        <TextInput id="contact-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} required placeholder="Logo generator feedback" />
      </div>
      <div className="mt-4">
        <Label htmlFor="contact-message">Message</Label>
        <TextArea id="contact-message" rows={6} value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} required placeholder="What happened, and what would help?" />
      </div>
      <Button type="submit" disabled={!ready} className="mt-5">Send message</Button>
      {mailto && (
        <p className="mt-3 text-sm text-muted-fg dark:text-slate-400">
          Or <a className="underline" href={mailto}>open your email app</a> addressed to {email} instead.
          Replies are sent by an admin from their own email app.
        </p>
      )}
    </form>
  );
}
