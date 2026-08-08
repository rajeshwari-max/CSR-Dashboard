import type { Config } from "tailwindcss";

/**
 * Tailwind is a utility layer on top of the draft stylesheet. Colours, radii
 * and shadows all resolve to the draft's CSS variables so a utility class can
 * never drift from the design spec.
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        bg: "var(--bg)",
        text: "var(--text)",
        "text-soft": "var(--text-soft)",
        border: "var(--border)",
        accent: { DEFAULT: "var(--blue-light)", foreground: "var(--accent)" },
        "accent-2": "var(--accent-2)",
        "accent-3": "var(--accent-3)",
        success: "var(--success)",
        "success-bg": "var(--success-bg)",
        warning: "var(--warning)",
        "warning-bg": "var(--warning-bg)",
        danger: "var(--danger)",
        "danger-bg": "var(--danger-bg)",
        "blue-light": "var(--blue-light)",

        /*
         * Compatibility layer.
         *
         * Components written before the draft palette landed use shadcn's
         * colour names. Without these, classes like `text-muted-foreground`
         * and `bg-card` compile to nothing and those panels render unstyled —
         * which is exactly why some cards looked blank. Every name below is
         * pointed at a draft token, so the older pages inherit the same
         * palette rather than a second, competing one.
         */
        background: "var(--bg)",
        foreground: "var(--text)",
        card: { DEFAULT: "var(--surface)", foreground: "var(--text)" },
        popover: { DEFAULT: "var(--surface)", foreground: "var(--text)" },
        muted: { DEFAULT: "var(--surface-2)", foreground: "var(--text-soft)" },
        primary: { DEFAULT: "var(--accent)", foreground: "#ffffff" },
        secondary: { DEFAULT: "var(--surface-2)", foreground: "var(--text)" },
        destructive: { DEFAULT: "var(--danger)", foreground: "#ffffff" },
        input: "var(--border)",
        ring: "var(--accent)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        card: "var(--shadow-sm)",
        pop: "var(--shadow-lg)",
      },
      fontFamily: {
        sans: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "2xs": "10.5px",
        xs2: "11px",
        xs3: "11.5px",
        sm2: "12.5px",
        base2: "13.5px",
      },
    },
  },
  plugins: [],
};

export default config;
