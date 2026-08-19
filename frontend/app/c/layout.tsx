import type { Metadata } from "next";

// /c/{token} is the client dashboard: it lists who was photographed and who
// was not, for a named company. The token is the only thing protecting it.
// See app/g/layout.tsx for the reasoning.
export const metadata: Metadata = {
  referrer: "origin",
  robots: { index: false, follow: false },
};

export default function ClientDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
