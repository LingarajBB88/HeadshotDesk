"use client";

// Studio profile.
//
// Everything here is shown to participants, on signup pages, in their
// gallery, and on the public profile page. That's the organising idea of
// the screen: a photographer should never have to guess whether a field is
// public, because all of them are.
//
// It lives on the account rather than per job, since a website doesn't
// change between shoots and retyping it every time guarantees it goes stale
// on half of them. The two things that DO change per shoot, directions and
// prep notes, live on the job instead.

import { useEffect, useRef, useState } from "react";

import { FormField } from "@/components/FormField";
import { ApiError } from "@/lib/api";
import {
  addPortfolioImage,
  getStudio,
  removePortfolioImage,
  removePortrait,
  setPortfolioCaption,
  suggestHandle,
  updateStudio,
  uploadPortrait,
  type StudioLink,
  type StudioProfile,
} from "@/lib/studio";

const MAX_LINKS = 5;
const MAX_PORTFOLIO = 8;
const MAX_ABOUT = 1200;

export default function SettingsPage() {
  const [profile, setProfile] = useState<StudioProfile | null>(null);
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [links, setLinks] = useState<StudioLink[]>([]);

  const [handle, setHandle] = useState("");
  const [tagline, setTagline] = useState("");
  const [about, setAbout] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const portraitInput = useRef<HTMLInputElement>(null);
  const portfolioInput = useRef<HTMLInputElement>(null);

  function hydrate(p: StudioProfile) {
    setProfile(p);
    setWebsite(p.website_url ?? "");
    setEmail(p.contact_email ?? "");
    setPhone(p.contact_phone ?? "");
    setLinks(p.links ?? []);
    setTagline(p.tagline ?? "");
    setAbout(p.about ?? "");
    setCity(p.city ?? "");
    setCountry(p.country ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getStudio();
        if (cancelled) return;
        hydrate(p);
        // Prefill the address rather than leaving it blank. A blank slug
        // field is where the intention to publish quietly dies.
        setHandle(p.handle ?? (await suggestHandle().catch(() => "")));
      } catch {
        if (!cancelled) setError("Couldn't load your studio details.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Empty rows are a half-finished thought, not data. Drop them rather
      // than making someone tidy up before they can save.
      const cleaned = links.filter((l) => l.label.trim() && l.url.trim());
      const updated = await updateStudio({
        website_url: website.trim() || null,
        contact_email: email.trim() || null,
        contact_phone: phone.trim() || null,
        links: cleaned,
        handle: handle.trim() || null,
        tagline: tagline.trim() || null,
        about: about.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
      });
      hydrate(updated);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save. Check the addresses and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  /** Wraps an image action so a failure shows a message instead of
   *  silently doing nothing, which is what an unhandled rejection looks
   *  like from the outside. */
  async function run(label: string, fn: () => Promise<StudioProfile>) {
    setBusy(label);
    setError(null);
    try {
      hydrate(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function togglePublished() {
    if (!profile) return;
    const next = !profile.profile_published;
    // Publishing needs an address, and saving the form is what assigns one.
    // Doing it in this order means the toggle works on first use rather
    // than erroring on a handle the photographer has clearly already typed.
    if (next && !profile.handle && handle.trim()) {
      await run("publish", () => updateStudio({ handle: handle.trim() }));
    }
    await run("publish", () => updateStudio({ profile_published: next }));
  }

  if (error && !profile) return <p className="text-sm text-red-600">{error}</p>;
  if (!profile) return <p className="text-sm text-muted-600">Loading…</p>;

  const published = profile.profile_published;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Studio details
      </h1>
      <p className="mt-1 text-sm text-muted-600">
        Everything on this page is shown to participants, on your signup
        pages and in their galleries. Leave anything blank to hide it.
      </p>

      <div className="mt-8 rounded-card border border-muted-200 bg-paper p-5">
        <h2 className="text-sm font-semibold text-ink">How to reach you</h2>
        <p className="mt-0.5 mb-4 text-xs text-muted-600">
          A signup form from nobody is unsettling. This is who is
          photographing them.
        </p>

        <FormField
          label="Website"
          name="website_url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="pantherstudios.nl"
          hint="Typing it without https:// is fine."
        />
        <FormField
          label="Contact email"
          name="contact_email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="hello@yourstudio.com"
          /* Deliberately separate from the login address: the one you sign
             in with usually isn't the one you want strangers replying to. */
          hint="Can be different from the address you sign in with."
        />
        <FormField
          label="Phone"
          name="contact_phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+31 6 1234 5678"
          hint="Optional. Useful for someone running late on the day."
        />
      </div>

      {/* --- Public profile ------------------------------------------- */}

      <div className="mt-6 rounded-card border border-muted-200 bg-paper p-5">
        <h2 className="text-sm font-semibold text-ink">Your profile page</h2>
        <p className="mt-0.5 mb-4 text-xs text-muted-600">
          A page of your own that participants can open from their
          confirmation email. Search engines can find it too, though be
          realistic: it will rank for your name, not for
          &ldquo;headshot photographer&rdquo;.
        </p>

        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          {profile.portrait_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.portrait_url}
              alt="Your portrait"
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted-100 text-xs text-muted-600">
              No photo
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs">
            <button
              onClick={() => portraitInput.current?.click()}
              disabled={busy !== null}
              className="font-medium text-accent hover:underline disabled:opacity-60"
            >
              {profile.portrait_url ? "Replace photo" : "Add a photo of you"}
            </button>
            {profile.portrait_url ? (
              <button
                onClick={() => run("portrait", removePortrait)}
                disabled={busy !== null}
                className="text-muted-600 transition hover:text-red-600 disabled:opacity-60"
              >
                Remove
              </button>
            ) : null}
            <input
              ref={portraitInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) run("portrait", () => uploadPortrait(file));
              }}
            />
          </div>
        </div>

        <label className="mb-4 block">
          <span className="block text-xs font-medium text-muted-600">
            Profile address
          </span>
          <div className="mt-1 flex items-center rounded-md border border-muted-200 bg-paper focus-within:border-accent">
            <span className="pl-3 text-sm text-muted-600">headshotdesk.com/p/</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="your-studio"
              className="w-full bg-transparent py-2 pr-3 text-sm outline-none"
            />
          </div>
          <span className="mt-1 block text-xs text-muted-600">
            Lowercase letters, numbers, and hyphens. Changing it later breaks
            any link you&apos;ve already shared, so pick one you can live with.
          </span>
        </label>

        <FormField
          label="Tagline"
          name="tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Headshots for people who hate having their photo taken"
          hint="One line, shown under your name."
        />

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <FormField
            label="City"
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Amsterdam"
          />
          <FormField
            label="Country"
            name="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Netherlands"
          />
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-muted-600">
            About you
          </span>
          <textarea
            value={about}
            maxLength={MAX_ABOUT}
            onChange={(e) => setAbout(e.target.value)}
            rows={6}
            placeholder="Who you are, how you work, and what someone can expect when they sit down in front of your camera."
            className="mt-1 w-full rounded-md border border-muted-200 bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <span className="mt-1 flex justify-between text-xs text-muted-600">
            <span>
              Written for someone about to be photographed by you, not for a
              search engine.
            </span>
            <span>{about.length}/{MAX_ABOUT}</span>
          </span>
        </label>
      </div>

      {/* --- Portfolio ------------------------------------------------ */}

      <div className="mt-6 rounded-card border border-muted-200 bg-paper p-5">
        <h2 className="text-sm font-semibold text-ink">Sample work</h2>
        <p className="mt-0.5 mb-4 text-xs text-muted-600">
          Up to {MAX_PORTFOLIO} images on your profile page. A taste, not a
          gallery: pick the ones that show what someone will actually get.
          Make sure you have permission to publish anyone who is recognisable.
        </p>

        {profile.portfolio.length > 0 ? (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {profile.portfolio.map((image) => (
              <div key={image.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.caption ?? "Sample"}
                  className="aspect-[4/5] w-full rounded-md object-cover"
                />
                <input
                  defaultValue={image.caption ?? ""}
                  placeholder="Caption"
                  maxLength={120}
                  onBlur={(e) => {
                    const next = e.target.value.trim() || null;
                    if (next !== (image.caption ?? null)) {
                      run("caption", () =>
                        setPortfolioCaption(image.id, next),
                      );
                    }
                  }}
                  className="mt-1.5 w-full rounded border border-muted-200 bg-paper px-2 py-1 text-xs outline-none focus:border-accent"
                />
                <button
                  onClick={() =>
                    run("portfolio", () => removePortfolioImage(image.id))
                  }
                  disabled={busy !== null}
                  className="mt-1 text-xs text-muted-600 transition hover:text-red-600 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {profile.portfolio.length < MAX_PORTFOLIO ? (
          <>
            <button
              onClick={() => portfolioInput.current?.click()}
              disabled={busy !== null}
              className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
            >
              {busy === "portfolio" ? "Uploading…" : "+ Add an image"}
            </button>
            <input
              ref={portfolioInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) run("portfolio", () => addPortfolioImage(file));
              }}
            />
          </>
        ) : (
          <p className="text-xs text-muted-600">
            That&apos;s the maximum. Remove one to add another.
          </p>
        )}
      </div>

      {/* --- Publish -------------------------------------------------- */}

      <div className="mt-6 rounded-card border border-muted-200 bg-paper p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {published ? "Your profile is live" : "Publish your profile"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-600">
              {published ? (
                <>
                  Anyone with the link can see it, and it&apos;s linked from
                  every participant email.{" "}
                  {profile.profile_url ? (
                    <a
                      href={profile.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      View it
                    </a>
                  ) : null}
                </>
              ) : (
                <>
                  Nothing above is visible on a profile page until you turn
                  this on. Save your changes first.
                </>
              )}
            </p>
          </div>
          <button
            onClick={togglePublished}
            disabled={busy !== null || (!published && !handle.trim())}
            className={
              published
                ? "rounded-md border border-muted-200 px-3 py-1.5 text-sm transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                : "btn-primary text-sm disabled:opacity-60"
            }
          >
            {busy === "publish"
              ? "Working…"
              : published
                ? "Unpublish"
                : "Publish"}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-card border border-muted-200 bg-paper p-5">
        <h2 className="text-sm font-semibold text-ink">Links</h2>
        <p className="mt-0.5 mb-4 text-xs text-muted-600">
          Anything worth reading before a shoot. A &ldquo;how to
          prepare&rdquo; post earns its place here: people who know what to
          wear photograph better.
        </p>

        {links.map((link, i) => (
          <div key={i} className="mb-3 flex flex-wrap items-end gap-2">
            <label className="block flex-1 min-w-[10rem]">
              <span className="block text-xs font-medium text-muted-600">
                Label
              </span>
              <input
                value={link.label}
                onChange={(e) =>
                  setLinks((ls) =>
                    ls.map((l, j) =>
                      j === i ? { ...l, label: e.target.value } : l,
                    ),
                  )
                }
                placeholder="How to prepare"
                className="mt-1 w-full rounded-md border border-muted-200 bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block flex-[2] min-w-[12rem]">
              <span className="block text-xs font-medium text-muted-600">
                Address
              </span>
              <input
                value={link.url}
                onChange={(e) =>
                  setLinks((ls) =>
                    ls.map((l, j) =>
                      j === i ? { ...l, url: e.target.value } : l,
                    ),
                  )
                }
                placeholder="yourstudio.com/prepare"
                className="mt-1 w-full rounded-md border border-muted-200 bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
            <button
              onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
              className="pb-2 text-xs text-muted-600 hover:text-red-600 transition"
            >
              Remove
            </button>
          </div>
        ))}

        {links.length < MAX_LINKS ? (
          <button
            onClick={() => setLinks((ls) => [...ls, { label: "", url: "" }])}
            className="text-xs font-medium text-accent hover:underline"
          >
            + Add a link
          </button>
        ) : (
          <p className="text-xs text-muted-600">
            {MAX_LINKS} links is the maximum. More than that and people stop
            reading any of them.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary text-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved ? (
          <span className="text-sm text-green-700">
            Saved. Your signup pages show this now.
          </span>
        ) : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
