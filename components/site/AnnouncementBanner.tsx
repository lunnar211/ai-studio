import { getSettings } from "@/lib/settings";

// Admin-controlled banner: announcement text and/or maintenance notice.
// Renders nothing when both are off. Server component; reads SiteSetting
// (defaults when the DB is not configured).
export async function AnnouncementBanner() {
  const settings = await getSettings();
  const announcement = settings.announcement?.trim();
  const maintenance = settings.maintenanceMode === "true";
  if (!announcement && !maintenance) return null;
  return (
    <div role="status" className="border-b-2 border-line bg-amber-50 px-4 py-3 text-center dark:bg-amber-950">
      <p className="mx-auto max-w-6xl text-base font-medium">
        {maintenance && "Maintenance notice: some features may be limited right now. "}
        {announcement}
      </p>
    </div>
  );
}
