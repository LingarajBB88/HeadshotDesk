"use client";

// A bar shown only to the photographer who owns the profile they're
// looking at.
//
// The public page is server-rendered and deliberately knows nothing about
// who is viewing it, which is right: it's read by strangers from an email.
// But the owner arrives here too, sees their own page, and has no way back
// to the thing that edits it. Landing on your own page with no route to
// change it is the kind of dead end people give up at.
//
// Renders nothing for visitors, and nothing while we're still checking, so
// a stranger never sees it flash.

import { useEffect, useState } from "react";

import { getAccessToken } from "@/lib/auth";
import { getStudio, type StudioProfile } from "@/lib/studio";

export function ProfileOwnerBar({ handle }: { handle: string }) {
  const [mine, setMine] = useState<StudioProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    // No token means a visitor. Don't call the API at all: an anonymous
    // read of an authenticated endpoint is a 401 in everyone's logs for
    // no reason.
    if (!getAccessToken()) return;
    (async () => {
      try {
        const studio = await getStudio();
        if (!cancelled && studio.handle === handle) setMine(studio);
      } catch {
        // Expired session, offline, anything. A visitor's view is the
        // safe default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  if (!mine) return null;

  const missing: string[] = [];
  if (!mine.portrait_url) missing.push("a photo of you");
  if (!mine.tagline) missing.push("a tagline");
  if (!mine.about) missing.push("an about paragraph");
  if (mine.portfolio.length === 0) missing.push("sample work");

  return (
    <div className="mb-8 rounded-card border border-muted-200 bg-muted-50 p-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium text-ink">
          This is your public profile.
        </span>
        <span className="text-muted-600">Only you can see this bar.</span>
        <a
          href="/settings"
          className="ml-auto font-medium text-accent hover:underline"
        >
          Edit in Settings
        </a>
      </p>
      {missing.length > 0 ? (
        <p className="mt-2 text-xs text-muted-600">
          Still missing: {missing.join(", ")}. None of it is required, but a
          page with only your name gives someone no reason to trust you with
          their photo.
        </p>
      ) : null}
    </div>
  );
}
