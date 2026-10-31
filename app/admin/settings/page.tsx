import { requireAdminPage } from "@/lib/admin-page";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "../AdminForms";

export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  await requireAdminPage(["SUPER"]);
  const settings = await getSettings();
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-2xl font-bold">Content &amp; settings (SUPER only)</h2>
      <p className="text-muted-fg dark:text-slate-300">
        Quotas, cost estimates, budget alerts, tool toggles and the announcement banner.
        Maintenance mode is honoured by the tool pages&apos; banner below; the tools themselves
        stay available to guests unless their toggle is off.
      </p>
      <SettingsForm initial={settings} />
      {settings.maintenanceMode === "true" && (
        <p role="alert" className="border-2 border-destructive bg-red-50 p-4 font-semibold dark:bg-red-950">
          Maintenance mode is ON. Tool pages should show the banner (see home page).
        </p>
      )}
      {settings.announcement && (
        <p className="border-2 border-line bg-white p-4 dark:bg-slate-900">Current announcement: {settings.announcement}</p>
      )}
    </div>
  );
}
