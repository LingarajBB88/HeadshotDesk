/**
 * Small section divider with an uppercase label and a hairline below.
 *
 * Round-2 polish for the Job detail page: gives the page five scannable
 * zones (Overview, Job details, Sharing, Participants, Photos) without
 * adding card backgrounds or heavy borders that would compete with the
 * shoot-day hero card.
 *
 * Designed to sit *above* the section it labels, not inside a CollapsibleSection
 * (which already has its own clickable heading and chevron).
 */
export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 mt-12 first:mt-0 flex items-center gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-600">
        {children}
      </h3>
      <span className="h-px flex-1 bg-muted-200" aria-hidden />
    </div>
  );
}
