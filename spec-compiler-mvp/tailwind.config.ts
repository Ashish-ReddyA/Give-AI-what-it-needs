import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F4F7FB",
        surface: "#FFFFFF",
        surfaceSubtle: "#F8FAFC",
        primary: "#2563EB",
        primaryHover: "#1D4ED8",
        primarySoft: "#EFF6FF",
        textPrimary: "#0F172A",
        textSecondary: "#475569",
        textMuted: "#64748B",
        borderUi: "#E2E8F0",
        borderStrong: "#CBD5E1",
        success: "#15803D",
        successSoft: "#F0FDF4",
        warning: "#B45309",
        warningSoft: "#FFFBEB",
        danger: "#B91C1C",
        dangerSoft: "#FEF2F2",
        // Compatibility aliases while components migrate to semantic names.
        paper: "#F4F7FB",
        paperRaised: "#FFFFFF",
        paperDeep: "#F1F5F9",
        ink: "#0F172A",
        inkMuted: "#475569",
        inkFaint: "#64748B",
        risk: "#B45309",
        riskSoft: "#FFFBEB",
        safe: "#15803D",
        safeSoft: "#F0FDF4",
        line: "#E2E8F0",
        lineSoft: "#F1F5F9",
        accent: "#2563EB",
        accentSoft: "#EFF6FF",
      },
      fontFamily: {
        display: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        body: ["var(--font-body)", "sans-serif"],
      },
      borderRadius: {
        ui: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.08)",
        cardLg: "0 8px 24px rgba(15,23,42,0.08)",
        inset: "inset 0 0 0 1px rgba(37,99,235,0.12)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
