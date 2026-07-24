import { Fragment, type ReactNode } from "react";

/**
 * Inline two-tone brand wordmark: "Headshot" in accent, "Desk" in ink.
 * Use wherever the product name appears in prose so the brand shows
 * through, matching the Logo component's wordmark treatment.
 */
export function BrandName() {
  return (
    <span className="font-medium">
      <span className="text-accent">Headshot</span>
      <span className="text-ink">Desk</span>
    </span>
  );
}

/**
 * Render a plain string with every "HeadshotDesk" occurrence replaced by
 * the branded wordmark. For content that lives in data (help articles,
 * landing copy arrays) where JSX can't be embedded.
 */
export function renderBrand(text: string): ReactNode {
  const parts = text.split("HeadshotDesk");
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? <BrandName /> : null}
      {part}
    </Fragment>
  ));
}
