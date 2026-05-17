"use client";

import { useEffect, useState } from "react";

import { getAccessToken } from "@/lib/auth";
import { fileThumbnailUrl } from "@/lib/files";

/**
 * Authenticated image thumbnail.
 *
 * The thumbnail endpoint serves a server-resized JPEG (~30KB) — way faster
 * than streaming the full 5MB+ original. Backend caches both ways too.
 *
 * Auth: the thumbnail endpoint requires a Bearer token, which <img src> can't
 * send. So we fetch via authed fetch and use a blob URL. Revoked on unmount
 * to avoid leaking object URLs.
 */
export function ImageThumbnail({
  fileId,
  alt,
  size = 64,
}: {
  fileId: string;
  alt: string;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const token = getAccessToken();
        if (!token) return;
        const res = await fetch(fileThumbnailUrl(fileId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        createdUrl = url;
        if (!cancelled) setSrc(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [fileId]);

  const style = { width: size, height: size };

  if (failed) {
    return (
      <div
        style={style}
        className="rounded-md bg-muted-100 text-muted-400 text-xs flex items-center justify-center shrink-0"
      >
        ?
      </div>
    );
  }
  if (!src) {
    return (
      <div
        style={style}
        className="rounded-md bg-muted-100 animate-pulse shrink-0"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={style}
      className="rounded-md object-cover bg-muted-100 shrink-0"
    />
  );
}
