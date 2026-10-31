// AdSense placeholder: renders NOTHING until NEXT_PUBLIC_ADSENSE_PUBLISHER_ID
// is set. Never enable ads before approval.
export function AdSlot({ slot }: { slot?: string }) {
  const publisher = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;
  if (!publisher) return null;
  return (
    <div className="my-8 border-2 border-line bg-white p-4 text-center text-sm text-muted-fg" aria-label="Advertisement">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={publisher}
        data-ad-slot={slot ?? ""}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
