# Brand

## Name (locked)
**HeadshotDesk** — see DECISIONS.md D-008.

## Voice & visual direction
- **Modern, minimal, photographer-respected.** Think Linear, Vercel, Notion — not "tech bro neon."
- Generous whitespace. One accent color. Photography-respectful (we're a tool for visual professionals; the UI shouldn't fight the photos).
- Sans-serif everywhere. Recommended: **Inter** (system standard) or **Geist** (Vercel's, free).
- Photography UIs traditionally lean dark — we'll support a clean dark mode but default to light.

## Color palette (locked — Cool Studio)
Single accent, neutral base. See DECISIONS.md D-007/D-008.

| Token | Hex | Usage |
|---|---|---|
| `ink` | `#0B0F1A` | Primary text on light, surface on dark |
| `paper` | `#FFFFFF` | Default light surface |
| `accent` | `#5B6CFF` | Primary brand color (electric indigo) |
| `accent-fg` | `#FFFFFF` | Foreground on accent surfaces |
| `accent-muted` | `#EEF0FF` | Subtle tint for hover states |
| `text-muted` | `#475569` | Secondary text |
| `border` | `#E5E7EB` | Default border |

These tokens live in `frontend/tailwind.config.ts` and should be used everywhere. Never hardcode hex values in components.

### Considered but not chosen
- *Studio Charcoal* — warm coral accent (`#E85D3A`). Editorial mood, but corporate audience reads it as too creative.
- *Quiet Premium* — pure monochrome. Beautiful but lacks the brand differentiation a single accent gives us.

## Logo (locked)
Combined Concept C tile + Concept B color split. See `logo-final.svg` and `logo-icon.svg`.

- **Full lockup** (`docs/logo-final.svg`, mirrored at `frontend/public/logo.svg`) — for marketing site, dashboard headers, email signatures.
- **Icon only** (`docs/logo-icon.svg`, mirrored at `frontend/public/logo-icon.svg`) — for compact spaces, app navigation.
- **Favicon** (`frontend/public/favicon.svg`) — tightly cropped icon mark for browser tabs.

### Logo construction
- Tile: 80×80, `border-radius: 18px`, fill `#0B0F1A`.
- Monogram: "HD" — Inter Tight, weight 600, `letter-spacing: -2`, fill `#FFFFFF`.
- Accent dot: 4px radius circle at (65, 18) inside tile, fill `#5B6CFF`.
- Wordmark: "Headshot" in `#5B6CFF`, "Desk" in `#0B0F1A`. Inter, weight 500, `letter-spacing: -1`.
- Reverse / dark mode: swap tile fill to `#FFFFFF`, monogram fill to `#0B0F1A`, accent dot stays `#5B6CFF`.

### Clear-space and minimum size
- Clear-space around the lockup: equal to the diameter of the accent dot (8px at standard scale) on all sides.
- Minimum lockup width: 120px. Below that, use the icon-only version.
- Minimum icon-only size: 16px (favicon).

### Concept files (superseded)
The original three concept drafts (`logo-concept-a.svg`, `logo-concept-b.svg`, `logo-concept-c.svg`) remain in this folder for historical reference but should not be used. Always use `logo-final.svg` / `logo-icon.svg`.

## Typography
- **Headings:** Inter Tight (or Geist) — weight 600
- **Body:** Inter — weight 400/500
- **Mono (for code/IDs):** JetBrains Mono or Geist Mono

## UI component library
- **Tailwind CSS** for utility-first styling
- **shadcn/ui** for accessible primitives (buttons, dialogs, dropdowns)
- **Lucide icons** (already used by shadcn — consistent line-icon set)

## Spacing & sizing rules
- 4px grid
- Default page max-width 1200px for marketing, 1400px for app
- Generous vertical rhythm (24px / 32px / 48px / 64px section spacing)
- Border radius: 8px (default), 12px (cards), 16px (dialogs)

## Naming conventions for the codebase
- Files/folders: `kebab-case` for frontend, `snake_case` for Python backend
- DB tables: `snake_case`, plural (e.g., `participants`, `galleries`)
- API routes: `/api/v1/{resource}` plural
- React components: `PascalCase`
- API + DB IDs: ULIDs (sortable, URL-safe; better than UUIDs for our use case)
