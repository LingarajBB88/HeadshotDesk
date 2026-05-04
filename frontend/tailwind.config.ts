import type { Config } from "tailwindcss";

// HeadshotDesk brand tokens — see docs/BRAND.md
// Currently using Option B (Cool Studio).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand
        ink: "#0B0F1A",      // primary text on light, surface on dark
        paper: "#FFFFFF",
        accent: {
          DEFAULT: "#5B6CFF",
          fg: "#FFFFFF",
          muted: "#EEF0FF",
        },
        // Semantic neutrals
        muted: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E5E7EB",
          400: "#94A3B8",
          600: "#475569",
          900: "#1F2937",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Inter Tight", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
        card: "12px",
        dialog: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
