import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#EFEDE4",
        paperRaised: "#F7F5EE",
        paperDeep: "#E6E2D3",
        ink: "#1C1B17",
        inkMuted: "#5B5748",
        inkFaint: "#8A8674",
        risk: "#A6291F",
        riskSoft: "#F1DBD8",
        safe: "#2E5C42",
        safeSoft: "#DCE6DE",
        line: "#D8D3C4",
        lineSoft: "#E4E0D1",
        accent: "#3D5A6C",
        accentSoft: "#DDE4E9",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,27,23,0.04), 0 2px 8px rgba(28,27,23,0.05)",
        cardLg: "0 2px 4px rgba(28,27,23,0.06), 0 8px 24px rgba(28,27,23,0.07)",
        inset: "inset 0 1px 2px rgba(28,27,23,0.05)",
      },
      backgroundImage: {
        perforation:
          "repeating-linear-gradient(90deg, transparent, transparent 6px, #D8D3C4 6px, #D8D3C4 8px)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          "0%": { opacity: "0", maxHeight: "0" },
          "100%": { opacity: "1", maxHeight: "1000px" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-down": "slide-down 0.25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
