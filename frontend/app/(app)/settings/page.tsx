"use client";

// Studio profile.
//
// Everything here is shown to participants, on signup pages and in their
// gallery. That's the organising idea of the screen: a photographer should
// never have to guess whether a field is public, because all of them are.
//
// It lives on the account rather than per job, since a website doesn't
// change between shoots and retyping it every time guarantees it goes stale
// on half of them.

import { useEffect, useState } from "react";

import { FormField } from "@/components/FormField";
import { ApiError } from "@/lib/api";
import {
  getStudio,
  updateStudio,
  type StudioLink,
  type StudioProfile,
} from "@/lib/studio";

const MAX_LINKS = 5;

export default function SettingsPage() {
  const [profile, setProfile] = useState<StudioProfile | null>(null);
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [links, setLinks] = useState<StudioLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getStudio();
        if (cancelled) return;
        setProfile(p);
        setWebsite(p.website_url ?? "");
        setEmail(p.contact_email ?? "");
        setPhone(p.contact_phone ?? "");
        setLinks(p.links ?? []);
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
      const cleaned = links.filter(
        (l) => l.label.trim() && l.url.trim(),
      );
      const updated = await updateStudio({
        website_url: website.trim() || null,
        contact_email: email.trim() || null,
        contact_phone: phone.trim() || null,
        links: cleaned,
      });
      setProfile(updated);
      setLinks(updated.links ?? []);
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

  if (error && !profile) return <p className="text-sm text-red-600">{error}</p>;
  if (!profile) return <p className="text-sm text-muted-600">Loading…</p>;

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
