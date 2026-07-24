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
        ink: "#1C1B17",
        inkMuted: "#5B5748",
        risk: "#A6291F",
        riskSoft: "#F1DBD8",
        safe: "#2E5C42",
        safeSoft: "#DCE6DE",
        line: "#D8D3C4",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        body: ["var(--font-body)", "sans-serif"],
      },
      backgroundImage: {
        perforation:
          "repeating-linear-gradient(90deg, transparent, transparent 6px, #D8D3C4 6px, #D8D3C4 8px)",
      },
    },
  },
  plugins: [],
};

export default config;
