/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Daybreak consumer tokens (mvp_ui_design_spec.md §3.1) — values live
        // as CSS variables in app/(daybreak)/daybreak.css (UXG-1: screens
        // consume tokens only; a palette change is one file).
        db: {
          bg: "var(--db-bg)",
          surface: "var(--db-surface)",
          ink: "var(--db-ink)",
          muted: "var(--db-muted)",
          line: "var(--db-line)",
          accent: "var(--db-accent)",
          "accent-soft": "var(--db-accent-soft)",
          signal: "var(--db-signal)",
          review: "var(--db-review)",
          none: "var(--db-none)",
          urgent: "var(--db-urgent)",
        },
      },
      fontFamily: {
        "db-serif": ["var(--font-db-serif)", "Georgia", "serif"],
        "db-sans": ["var(--font-db-sans)", "system-ui", "sans-serif"],
        "db-mono": ["var(--font-db-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
}
