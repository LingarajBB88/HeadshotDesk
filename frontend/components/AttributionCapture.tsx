"use client";

// Records where a visitor came from, once, on their first page.
//
// Sits in the root layout so it runs wherever someone lands, since the
// entry point is rarely the home page. Renders nothing.

import { useEffect } from "react";

import { captureAttribution } from "@/lib/attribution";

export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
