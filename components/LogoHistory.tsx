// Signed-in user's saved logo history: favorites, delete, clear-all.
// Fetches /api/account/jobs. If the database has not had the new schema
// pushed yet, the API answers 503 and this section says so honestly
// instead of pretending history is empty.
"use client";
import { useEffect, useState } from "react";
import { Download, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/field";

type LogoJob = {
  id: string;
  prompt: string;
  style: string;
  colors: string;
  brandName: string | null;
  favorite: boolean;
  createdAt: string;
  variants: string[];
};

function downloadBlob(svg: string, name: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LogoHistory() {
  const [jobs, setJobs] = useState<LogoJob[] | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    fetch("/api/account/jobs")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { jobs?: LogoJob[]; error?: string };
        if (!res.ok) setError(data.error || "Could not load logo history.");
        else setJobs(data.jobs ?? []);
      })
      .catch(() => setError("Could not load logo history."));
  }, []);

  async function toggleFavorite(job: LogoJob) {
    const res = await fetch(`/api/account/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: !job.favorite }),
    });
    if (res.ok) setJobs((prev) => (prev ?? []).map((j) => (j.id === job.id ? { ...j, favorite: !j.favorite } : j)));
  }

  async function remove(job: LogoJob) {
    const res = await fetch(`/api/account/jobs/${job.id}`, { method: "DELETE" });
    if (res.ok) setJobs((prev) => (prev ?? []).filter((j) => j.id !== job.id));
  }

  async function clearAll() {
    const res = await fetch("/api/account/jobs", { method: "DELETE" });
    if (res.ok) {
      setJobs([]);
      setConfirmClear(false);
    }
  }

  return (
    <section aria-label="Saved logos">
      <h2 className="text-2xl font-bold">Saved logos</h2>
      {error ? (
        <div className="mt-2"><Alert kind="info">{error}</Alert></div>
      ) : jobs === null ? (
        <p className="mt-2 text-muted-fg dark:text-slate-300">Loading your saved logos…</p>
      ) : jobs.length === 0 ? (
        <p className="mt-2 text-muted-fg dark:text-slate-300">
          No saved logos yet. Sign in, generate a logo, and it will appear here. Guest generations are not saved.
        </p>
      ) : (
        <div className="mt-2 space-y-4">
          <div className="flex justify-end">
            {confirmClear ? (
              <span className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirmClear(false)}>Keep them</Button>
                <Button type="button" variant="outline" onClick={clearAll}>Yes, delete all</Button>
              </span>
            ) : (
              <Button type="button" variant="outline" onClick={() => setConfirmClear(true)}>
                <Trash2 size={16} aria-hidden="true" /> Delete all saved logos
              </Button>
            )}
          </div>
          {jobs.map((job) => (
            <article key={job.id} className="border-2 border-line bg-white p-4 dark:bg-slate-900">
              <div className="flex flex-wrap items-start gap-4">
                {job.variants[0] && (
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-gray-50 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: job.variants[0] }} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{job.prompt}</p>
                  <p className="text-sm text-muted-fg dark:text-slate-400">
                    {job.style} · {job.colors}
                    {job.brandName ? ` · brand: ${job.brandName}` : ""} · {job.createdAt.slice(0, 10)} · {job.variants.length} variant{job.variants.length === 1 ? "" : "s"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => toggleFavorite(job)} aria-label={job.favorite ? "Remove from favorites" : "Add to favorites"}>
                      <Star size={16} aria-hidden="true" fill={job.favorite ? "currentColor" : "none"} /> {job.favorite ? "Favorited" : "Favorite"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setExpanded(expanded === job.id ? null : job.id)}>
                      {expanded === job.id ? "Hide variants" : "Show all variants"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => remove(job)} aria-label="Delete this saved logo">
                      <Trash2 size={16} aria-hidden="true" /> Delete
                    </Button>
                  </div>
                </div>
              </div>
              {expanded === job.id && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {job.variants.map((svg, i) => (
                    <div key={i} className="rounded-xl border border-line p-2">
                      <div className="aspect-square overflow-hidden rounded-lg bg-gray-50 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
                      <Button type="button" variant="outline" className="mt-2 w-full px-1 text-xs" onClick={() => downloadBlob(svg, `logo-${i + 1}.svg`)}>
                        <Download size={14} aria-hidden="true" /> Download SVG
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
