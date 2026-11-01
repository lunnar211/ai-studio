import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionSafe } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countJobsToday } from "@/lib/settings";
import { ExportButton, DeleteButton, CheckoutButton } from "./AccountActions";
import LogoHistory from "@/components/LogoHistory";

export const metadata: Metadata = {
  title: "My account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSessionSafe();
  if (!session?.user) redirect("/signin");
  const user = session.user;
  if (user.status === "SUSPENDED") {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl font-bold italic">My account</h1>
        <p className="mt-3 text-muted-fg dark:text-slate-300">
          This account is suspended. Contact support if you think this is a mistake.
        </p>
      </div>
    );
  }
  // Age confirmation gates account features (middleware cannot check this:
  // it lives in Prisma). Unconfirmed users complete onboarding first.
  if (!user.ageConfirmed) redirect("/onboarding");

  if (!prisma) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl font-bold italic">My account</h1>
        <p className="mt-3 text-muted-fg dark:text-slate-300">
          Signed in as {user.email}. The database is not configured yet, so usage history
          and data export are unavailable. The tools still work as guest tools.
        </p>
      </div>
    );
  }

  // If the tables were never pushed, these queries throw. Show the honest
  // schema-update message instead of a 500 (same wording as logo history).
  const accountData = await (async () => {
    try {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser) return null;
      const logoToday = await countJobsToday(user.id, "logo");
      const jobs = await prisma.job.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const subs = await prisma.subscription.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      const payments = await prisma.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
      return { dbUser, logoToday, jobs, subs, payments };
    } catch {
      return "schema-missing" as const;
    }
  })();
  if (accountData === null) redirect("/signin");
  if (accountData === "schema-missing") {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-4xl font-bold italic">My account</h1>
        <p className="mt-3 text-muted-fg dark:text-slate-300">
          Signed in as {user.email}. Logo and photo history are not available yet:
          the database needs one schema update (the site owner runs one command).
          The tools still work as guest tools.
        </p>
      </div>
    );
  }
  const { dbUser, logoToday, jobs, subs, payments } = accountData;
  // Photo jobs live in their own table (never in Job): query them
  // separately so a missing PhotoJob table degrades to an honest note
  // instead of taking the whole page down. `null` = table not pushed.
  const photoJobs = await (async () => {
    try {
      return await prisma.photoJob.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    } catch {
      return null;
    }
  })();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-4xl font-bold italic">My account</h1>
        <div className="mt-4 flex items-center gap-4 border-2 border-line bg-white p-4 dark:bg-slate-900">
          {dbUser.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dbUser.image} alt="" width={56} height={56} className="rounded-full" referrerPolicy="no-referrer" />
          )}
          <div>
            <p className="font-semibold">{dbUser.name || "No name set"}</p>
            <p className="text-muted-fg dark:text-slate-300">{dbUser.email}</p>
            <p className="text-sm text-muted-fg dark:text-slate-400">
              Plan: {dbUser.plan} · Country: {dbUser.country || "not set"} · Member since{" "}
              {dbUser.createdAt.toISOString().slice(0, 10)}
            </p>
          </div>
        </div>
      </div>

      <section aria-label="Usage today">
        <h2 className="text-2xl font-bold">Usage today</h2>
        <p className="mt-2 text-muted-fg dark:text-slate-300">
          Logo requests today: {logoToday} (unlimited) ·{" "}
          Photos: unlimited on the free routes{dbUser.plan === "PREMIUM" ? " + fast paid-GPU processing" : ""}
        </p>
        <div className="mt-4">
          <CheckoutButton />
        </div>
      </section>

      <section aria-label="Subscriptions">
        <h2 className="text-2xl font-bold">Subscriptions</h2>
        {subs.length === 0 ? (
          <p className="mt-2 text-muted-fg dark:text-slate-300">No subscriptions yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {subs.map((s) => (
              <li key={s.id} className="border-2 border-line bg-white p-3 dark:bg-slate-900">
                {s.plan} · {s.status} · provider {s.provider}
                {s.currentPeriodEnd ? ` · renews ${s.currentPeriodEnd.toISOString().slice(0, 10)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Job history">
        <h2 className="text-2xl font-bold">Job history</h2>
        {jobs.length === 0 ? (
          <p className="mt-2 text-muted-fg dark:text-slate-300">No jobs yet. Generate a logo or enhance a photo and it will appear here.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] border-2 border-line bg-white text-left dark:bg-slate-900">
              <thead>
                <tr className="border-b-2 border-line">
                  <th className="p-2">Tool</th><th className="p-2">Status</th><th className="p-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-line">
                    <td className="p-2">{j.tool}</td>
                    <td className="p-2">{j.status}{j.errorCode ? ` (${j.errorCode})` : ""}</td>
                    <td className="p-2">{j.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Photo jobs">
        <h2 className="text-2xl font-bold">Photo jobs</h2>
        {photoJobs === null ? (
          <p className="mt-2 text-muted-fg dark:text-slate-300">
            Photo job history is not available yet: the database needs one schema update
            (the site owner runs one command). Your photo jobs still work; they just are not saved here.
          </p>
        ) : photoJobs.length === 0 ? (
          <p className="mt-2 text-muted-fg dark:text-slate-300">No photo jobs yet. Enhance or colorize a photo and it will appear here.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] border-2 border-line bg-white text-left dark:bg-slate-900">
              <thead>
                <tr className="border-b-2 border-line">
                  <th className="p-2">Mode</th><th className="p-2">Status</th><th className="p-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {photoJobs.map((j) => (
                  <tr key={j.id} className="border-b border-line">
                    <td className="p-2">
                      <a className="underline" href={`/photo-enhancer?job=${j.id}`}>{j.mode}</a>
                    </td>
                    <td className="p-2">{j.status}{j.errorCode ? ` (${j.errorCode})` : ""}</td>
                    <td className="p-2">{j.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <LogoHistory />

      <section aria-label="Payments">
        <h2 className="text-2xl font-bold">Recent payments</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-muted-fg dark:text-slate-300">No payments yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {payments.map((p) => (
              <li key={p.id} className="border-2 border-line bg-white p-3 dark:bg-slate-900">
                {p.amount} {p.currency} · {p.status} · {p.createdAt.toISOString().slice(0, 10)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Your data" className="space-y-4 border-t-2 border-line pt-6">
        <h2 className="text-2xl font-bold">Your data</h2>
        <ExportButton />
        <DeleteButton />
      </section>
    </div>
  );
}
