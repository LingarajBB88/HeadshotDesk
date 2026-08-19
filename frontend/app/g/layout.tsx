import type { Metadata } from "next";

// The URL of this page is its own password: /g/{token} is all anyone needs
// to see a participant's photos.
//
// `referrer: "origin"` stops the token travelling in the Referer header the
// moment someone clicks any link from here, whether that is our own help
// page, the photographer's website, or an analytics beacon. Without it the
// full path is sent on same-origin navigations and the token ends up in
// logs and dashboards we do not control.
//
// noindex because a gallery has no business in a search result.
export const metadata: Metadata = {
  referrer: "origin",
  robots: { index: false, follow: false },
};

export default function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
