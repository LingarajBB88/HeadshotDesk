"use client";

// The sample experience for a photographer's own website, loaded in an
// iframe from the snippet on the Clients page. ?studio= carries the studio
// name so the banner reads as the photographer's own material.
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { SampleExperience } from "@/components/SampleExperience";

function EmbedInner() {
  const studio = useSearchParams()?.get("studio")?.trim().slice(0, 80) || null;
  return <SampleExperience embed studio={studio} />;
}

export default function EmbedSamplePage() {
  return (
    <Suspense fallback={null}>
      <EmbedInner />
    </Suspense>
  );
}
