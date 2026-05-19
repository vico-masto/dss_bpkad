import type { Config } from "tailwindcss";

/**
 * Tailwind v4 — tema utama ada di globals.css via @theme inline.
 * File ini hanya untuk: content scanning + ekstensi yang tidak bisa di-CSS-first.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      /**
       * Safelist warna DS agar tidak di-purge saat dipakai secara dinamis.
       * Nilai aktual (hex) didefinisikan di globals.css @theme inline.
       */
      colors: {
        "ds-primary":       "var(--ds-primary)",
        "ds-primary-hover": "var(--ds-primary-hover)",
        "ds-primary-fg":    "var(--ds-primary-fg)",
        "ds-accent":        "var(--ds-accent)",
        "ds-accent-hover":  "var(--ds-accent-hover)",
        "ds-accent-fg":     "var(--ds-accent-fg)",
        "ds-focus-ring":    "var(--ds-focus-ring)",
      },
    },
  },
  plugins: [],
};

export default config;
