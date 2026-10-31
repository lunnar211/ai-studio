import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { SupportReplyForm } from "../AdminForms";
import { CONTACT_EMAIL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function AdminSupport() {
  await requireAdminPage(["SUPER", "SUPPORT"]);
  if (!prisma) return <p>Database not configured.</p>;
  const messages = await prisma.supportMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Support inbox ({messages.length})</h2>
      <p className="text-muted-fg dark:text-slate-300">
        No SMTP is configured for this site, so replies are recorded here and sent via the
        mailto link (which opens the admin&apos;s own email app). Automated sending needs a
        future SMTP/Brevo env — it is not invented here.
      </p>
      {messages.length === 0 ? (
        <p className="border-2 border-line bg-white p-4 dark:bg-slate-900">No messages yet. The contact form stores messages here when the database is configured.</p>
      ) : (
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id} className="border-2 border-line bg-white p-4 dark:bg-slate-900">
              <p className="font-semibold">{m.subject} · {m.status}</p>
              <p className="text-sm text-muted-fg dark:text-slate-400">From {m.name} ({m.email}) · {m.createdAt.toISOString().slice(0, 16).replace("T", " ")}</p>
              <p className="mt-2 whitespace-pre-wrap">{m.message}</p>
              {m.reply && <p className="mt-2 border-t border-line pt-2"><span className="font-semibold">Recorded reply:</span> {m.reply}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  className="inline-flex min-h-[44px] items-center border-2 border-line px-4 font-semibold"
                  href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}&body=${encodeURIComponent(m.reply || "")}`}
                >
                  Send reply by email
                </a>
                {CONTACT_EMAIL && <span className="text-sm text-muted-fg dark:text-slate-400">Site contact: {CONTACT_EMAIL}</span>}
              </div>
              <div className="mt-3"><SupportReplyForm id={m.id} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
