import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";

import { Analytics } from "@/components/Analytics";
import { AttributionCapture } from "@/components/AttributionCapture";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });

export const metadata: Metadata = {
  title: "HeadshotDesk | Headshot workflow for photographers",
  description:
    "Software for photographers who shoot team and event headshots. From signup to delivered galleries, in one flow.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <body className="bg-paper text-ink font-sans antialiased">
        {children}
        <AttributionCapture />
        <Analytics />
      </body>
    </html>
  );
}
