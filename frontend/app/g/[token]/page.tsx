"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { Logo } from "@/components/Logo";
import { ApiError } from "@/lib/api";
import {
  downloadFile,
  downloadZip,
  getGallery,
  thumbnailUrl,
  type Gallery,
  type GalleryFile,
} from "@/lib/gallery";

// Where the logo links to. External target so it doesn't break the
// participant's flow if they click it mid-session.
const MARKETING_URL = "https://headshotdesk.com";

function BrandLink({ size }: { size: "sm" | "md" }) {
  return (
    <a
      href={MARKETING_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center hover:opacity-80 transition-opacity"
      aria-label="HeadshotDesk"
    >
      <Logo size={size} wordmark />
    </a>
  );
}

export default function PublicGalleryPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // file_id currently being downloaded individually — drives a per-card spinner.
  const [downloading, setDownloading] = useState<string | null>(null);
  // True while the bulk-zip request is in flight.
  const [zipping, setZipping] = useState(false);
  // Banner message shown after a download succeeds or fails.
  const [notice, setNotice] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);
  // Set of file_ids currently checked for the bulk-download path.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await getGallery(token);
        if (!cancelled) setGallery(g);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError(
            "Gallery isn't active. Ask your photographer for a new link.",
          );
        } else {
          setLoadError("Gallery didn't load. Try refreshing.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Derived counts. `newPicksSelected` is the subset of the user's selection
  // that would consume cap (i.e., not already saved).
  const { newPicksSelected, remaining, atCap } = useMemo(() => {
    if (!gallery) {
      return { newPicksSelected: 0, remaining: 0, atCap: false };
    }
    const claimedIds = new Set(
      gallery.files.filter((f) => f.is_downloaded).map((f) => f.id),
    );
    const newPicks = Array.from(selected).filter((id) => !claimedIds.has(id))
      .length;
    const rem = Math.max(gallery.download_cap - gallery.downloads_used, 0);
    return {
      newPicksSelected: newPicks,
      remaining: rem,
      atCap: gallery.downloads_used >= gallery.download_cap,
    };
  }, [gallery, selected]);

  // True when adding more new picks to the selection would exceed remaining.
  // We use this to disable un-claimed photo checkboxes once the budget's hit
  // — friendlier than letting the user select and then surprising them on
  // submit.
  const newPickBudgetExhausted = newPicksSelected >= remaining;

  function toggleSelect(file: GalleryFile) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(file.id)) {
        next.delete(file.id);
        return next;
      }
      // Block adding a NEW pick when the budget is exhausted. Already-saved
      // photos can always be added (free re-download).
      if (!file.is_downloaded && newPickBudgetExhausted) {
        setNotice({
          type: "err",
          text:
            remaining === 0
              ? "No picks left. Re-saves are still free."
              : `Only ${remaining} pick${remaining === 1 ? "" : "s"} left.`,
        });
        return prev;
      }
      next.add(file.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function selectAllAvailable() {
    if (!gallery) return;
    // Add every already-saved photo plus as many new photos as remaining
    // budget allows, in display order. Idempotent — repeated taps don't grow.
    const next = new Set<string>();
    let budget = remaining;
    for (const f of gallery.files) {
      if (f.is_downloaded) {
        next.add(f.id);
      } else if (budget > 0) {
        next.add(f.id);
        budget -= 1;
      }
    }
    setSelected(next);
  }

  async function onDownload(file: GalleryFile) {
    if (!gallery) return;
    if (downloading || zipping) return;
    setDownloading(file.id);
    setNotice(null);
    try {
      await downloadFile(token, file.id);
      // Mark this photo as saved locally so the UI updates immediately.
      setGallery((prev) => {
        if (!prev) return prev;
        const wasNew = !file.is_downloaded;
        return {
          ...prev,
          downloads_used: wasNew
            ? prev.downloads_used + 1
            : prev.downloads_used,
          files: prev.files.map((f) =>
            f.id === file.id ? { ...f, is_downloaded: true } : f,
          ),
        };
      });
      setNotice({
        type: "ok",
        text: file.is_downloaded ? "Saved again." : "Saved.",
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setNotice({ type: "err", text: err.message });
      } else {
        setNotice({ type: "err", text: "Didn't go through. Try again?" });
      }
    } finally {
      setDownloading(null);
    }
  }

  async function onDownloadZip() {
    if (!gallery) return;
    if (zipping || downloading) return;
    if (selected.size === 0) return;
    setZipping(true);
    setNotice(null);
    const fileIds = Array.from(selected);
    try {
      await downloadZip(token, fileIds);
      // Mark all selected as saved + bump used by the count of NEW picks.
      setGallery((prev) => {
        if (!prev) return prev;
        const claimedNow = new Set(
          prev.files.filter((f) => f.is_downloaded).map((f) => f.id),
        );
        const newCount = fileIds.filter((id) => !claimedNow.has(id)).length;
        return {
          ...prev,
          downloads_used: prev.downloads_used + newCount,
          files: prev.files.map((f) =>
            selected.has(f.id) ? { ...f, is_downloaded: true } : f,
          ),
        };
      });
      setNotice({
        type: "ok",
        text: `Saved ${fileIds.length} photo${fileIds.length === 1 ? "" : "s"}.`,
      });
      clearSelection();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setNotice({ type: "err", text: err.message });
      } else {
        setNotice({ type: "err", text: "Couldn't build your zip. Try again?" });
      }
    } finally {
      setZipping(false);
    }
  }

  if (loadError) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 py-12 bg-muted-50">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-8">
            <BrandLink size="md" />
          </div>
          <div className="bg-paper border border-muted-200 rounded-dialog p-8 shadow-sm">
            <p className="text-sm text-muted-700">{loadError}</p>
          </div>
        </div>
      </main>
    );
  }

  if (!gallery) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 py-12 bg-muted-50">
        <p className="text-sm text-muted-600">Loading…</p>
      </main>
    );
  }

  const cap = gallery.download_cap;
  const used = gallery.downloads_used;
  const totalPhotos = gallery.files.length;

  // Sticky bar shows when the user has at least one photo selected.
  const showSelectionBar = selected.size > 0;
  // Whether the user could still meaningfully use "Select all" — there's
  // either an un-claimed photo to add or a claimed one not yet selected.
  const canSelectMore =
    selected.size < totalPhotos &&
    gallery.files.some(
      (f) => !selected.has(f.id) && (f.is_downloaded || remaining > 0),
    );

  return (
    <main className="min-h-dvh bg-muted-50 pb-24">
      <header className="border-b border-muted-200 bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
          <BrandLink size="sm" />
          <span className="text-xs text-muted-600">Your photos</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
          Hi {gallery.participant_name.split(" ")[0]}, here are your photos
        </h1>
        <p className="mt-1 text-sm text-muted-600">
          From <strong className="text-ink">{gallery.job.name}</strong>
          {gallery.job.client_name ? <> with {gallery.job.client_name}</> : null}
          {gallery.job.shoot_date ? <> · {gallery.job.shoot_date}</> : null}.
        </p>

        {/* Headline rule card — short and clear, set BEFORE picking starts. */}
        <div className="mt-6 rounded-card border border-muted-200 border-l-4 border-l-accent bg-paper p-4">
          {cap === 0 ? (
            <>
              <p className="text-sm font-semibold text-ink">
                Your photos are almost ready.
              </p>
              <p className="mt-1 text-sm text-muted-700">
                Downloads aren&apos;t open yet. Check back soon.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink">
                Keep up to {cap} photo{cap === 1 ? "" : "s"}.
              </p>
              <p className="mt-1 text-sm text-muted-700">
                {atCap ? (
                  <>
                    <strong className="text-ink">All {cap} saved.</strong>{" "}
                    Re-downloads are free.
                  </>
                ) : used > 0 ? (
                  <>
                    <strong className="text-ink">
                      {used} of {cap} saved
                    </strong>{" "}
                    — {remaining} left. Re-downloads are free.
                  </>
                ) : (
                  <>Picks are final. Re-downloads are free.</>
                )}
              </p>
            </>
          )}
        </div>

        {/* Selection controls — kept inline, separate from the rules card so
            they don't compete with the headline message. */}
        {totalPhotos > 0 && cap > 0 ? (
          <div className="mt-4 inline-flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={selectAllAvailable}
              disabled={!canSelectMore || zipping}
              className="text-accent hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select all
            </button>
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                disabled={zipping}
                className="text-muted-700 hover:underline disabled:opacity-50"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        {notice ? (
          <p
            role="status"
            className={
              "mt-3 text-sm " +
              (notice.type === "ok" ? "text-green-700" : "text-red-600")
            }
          >
            {notice.text}
          </p>
        ) : null}

        {/* Photo grid */}
        {gallery.files.length === 0 ? (
          <div className="mt-10 rounded-card border border-dashed border-muted-300 bg-paper p-10 text-center">
            <p className="text-sm text-muted-700">
              No photos uploaded yet. Check back soon.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {gallery.files.map((f) => {
              const isSelected = selected.has(f.id);
              const isDownloading = downloading === f.id;
              // Disable single-file download when at cap AND this is a new
              // (un-claimed) photo. Already-claimed photos remain free to
              // re-download. Also disable while a bulk-zip is running.
              const dlDisabled =
                cap === 0 ||
                (atCap && !f.is_downloaded) ||
                isDownloading ||
                downloading !== null ||
                zipping;
              // Selecting a new (un-claimed) photo is blocked once the
              // remaining-pick budget is exhausted. Already-saved photos can
              // always be selected (re-downloads are free).
              const selectDisabled =
                cap === 0 ||
                zipping ||
                (!isSelected && !f.is_downloaded && newPickBudgetExhausted);

              return (
                <figure
                  key={f.id}
                  className={
                    "rounded-card overflow-hidden border bg-paper shadow-sm transition-colors " +
                    (isSelected
                      ? "border-accent ring-2 ring-accent/30"
                      : "border-muted-200")
                  }
                >
                  <div className="relative aspect-square bg-muted-100">
                    {/* Whole-image click toggles selection — much easier
                        than aiming at a small checkbox on mobile. */}
                    <button
                      type="button"
                      onClick={() => toggleSelect(f)}
                      disabled={selectDisabled}
                      aria-label={
                        isSelected
                          ? `Unselect ${f.original_filename}`
                          : `Select ${f.original_filename}`
                      }
                      aria-pressed={isSelected}
                      className="absolute inset-0 w-full h-full disabled:cursor-not-allowed"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnailUrl(token, f.id)}
                        alt={f.original_filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {/* Selection checkbox (decorative — the whole tile is
                          the button). */}
                      <span
                        className={
                          "absolute top-2 left-2 inline-flex items-center justify-center " +
                          "h-6 w-6 rounded-full text-[12px] font-medium border-2 " +
                          (isSelected
                            ? "bg-accent text-white border-accent"
                            : "bg-white/85 text-transparent border-white")
                        }
                        aria-hidden
                      >
                        ✓
                      </span>
                      {f.is_downloaded ? (
                        <span className="absolute top-2 right-2 rounded-full bg-ink/80 text-white text-[10px] font-medium px-2 py-0.5">
                          Saved
                        </span>
                      ) : null}
                    </button>
                  </div>
                  <figcaption className="p-3">
                    <button
                      type="button"
                      onClick={() => onDownload(f)}
                      disabled={dlDisabled}
                      className="btn-primary w-full text-xs py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDownloading
                        ? "Saving…"
                        : f.is_downloaded
                          ? "Save again"
                          : "Save photo"}
                    </button>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}

        <p className="mt-12 text-center text-xs text-muted-600">
          Powered by{" "}
          <a
            href={MARKETING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            HeadshotDesk
          </a>
        </p>
      </div>

      {/* Sticky bottom action bar — appears only when the user has selected
          at least one photo. Stays visible so they don't lose their picks
          if they scroll the grid. */}
      {showSelectionBar ? (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-muted-200 bg-paper/95 backdrop-blur">
          <div className="mx-auto max-w-5xl px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-700">
              <strong className="text-ink">{selected.size}</strong> picked
              {newPicksSelected > 0 ? (
                <>
                  {" "}
                  · {newPicksSelected} new
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={clearSelection}
                disabled={zipping}
                className="text-sm text-muted-700 hover:underline disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={onDownloadZip}
                disabled={zipping || selected.size === 0}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {zipping
                  ? "Zipping…"
                  : `Save ${selected.size} as .zip`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
