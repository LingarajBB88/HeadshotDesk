import type { Metadata } from "next";

// /q/{token} is the same participant token as the gallery, so the same
// rules apply: never let it leave in a Referer header, never index it.
// See app/g/layout.tsx for the reasoning.
export const metadata: Metadata = {
  referrer: "origin",
  robots: { index: false, follow: false },
};

export default function QueueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
