import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionSafe } from "@/lib/auth";
import AudioCleanerTool from "./AudioCleanerTool";

export const metadata: Metadata = {
  title: "Audio Cleaner — Noise Gate, Trim and Normalize",
  description:
    "Clean an audio file in your browser: a noise gate quiets background sound between speech, trim start and end, normalize volume to -1 dB peak, then preview before/after and download WAV. Sign-in required; the file never leaves your browser.",
};

export const dynamic = "force-dynamic";

export default async function AudioCleanerPage() {
  const session = await getSessionSafe();
  if (!session?.user) redirect("/signin?next=/audio-cleaner");
  const user = session.user;
  if (user.status === "SUSPENDED") {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl font-bold italic">Audio Cleaner</h1>
        <p className="mt-3 text-muted-fg dark:text-slate-300">
          This account is suspended. Contact support if you think this is a mistake.
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl font-bold italic">Audio Cleaner</h1>
      <p className="mt-3 text-muted-fg dark:text-slate-300">
        Clean an audio file on your own device: a noise gate quiets background
        sound between speech, trim trims the ends, and normalize sets the peak
        volume. Preview before and after, then download the cleaned file as WAV.
      </p>
      <p className="mt-3 text-muted-fg dark:text-slate-300">
        Cleaning improves sound quality only — it does not remove copyright,
        does not make a recording yours, and does not promise copyright-free
        output. A noise gate is not AI denoising: it quiets sound between
        speech, it does not remove noise under speech.
      </p>
      <div className="mt-6">
        <AudioCleanerTool />
      </div>
    </div>
  );
}
