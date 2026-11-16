import type { Metadata } from "next";

// Embedded pages live inside other people's websites. They should never
// show up in search results as pages of ours.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
