// Reusable logo component. Renders the HD tile with accent dot,
// optionally followed by the two-tone wordmark.
//
// Sizes: "sm" (24px tile, used in nav headers) | "md" (32px tile, used in auth card)

type Size = "sm" | "md";

const TILE_SIZES: Record<Size, string> = {
  sm: "h-7 w-7",   // 28px
  md: "h-9 w-9",   // 36px
};

const TILE_TEXT: Record<Size, string> = {
  sm: "text-[11px]",
  md: "text-sm",
};

const DOT_SIZE: Record<Size, string> = {
  sm: "h-[5px] w-[5px] top-1 right-1",
  md: "h-1.5 w-1.5 top-1.5 right-1.5",
};

const WORDMARK_SIZE: Record<Size, string> = {
  sm: "text-sm",
  md: "text-lg",
};

export function Logo({
  size = "sm",
  wordmark = false,
  hideWordmarkOnMobile = false,
}: {
  size?: Size;
  wordmark?: boolean;
  hideWordmarkOnMobile?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      <span
        className={
          "relative inline-flex items-center justify-center rounded-md " +
          "bg-ink text-paper font-display font-semibold " +
          TILE_SIZES[size] + " " + TILE_TEXT[size]
        }
        aria-label="HeadshotDesk"
      >
        HD
        <span
          className={"absolute rounded-full bg-accent " + DOT_SIZE[size]}
          aria-hidden
        />
      </span>
      {wordmark ? (
        <span
          className={
            "font-medium tracking-tight " +
            WORDMARK_SIZE[size] +
            (hideWordmarkOnMobile ? " hidden sm:inline" : "")
          }
        >
          <span className="text-accent">Headshot</span>
          <span className="text-ink">Desk</span>
        </span>
      ) : null}
    </span>
  );
}
