/** Scoped Tailwind for the GTM Intelligence agent ONLY.
 *  - content is limited to src/gtm so utilities are generated solely from GTM's files.
 *  - preflight (Tailwind's global reset) is DISABLED so the rest of the platform SPA
 *    (which uses plain App.css) is completely unaffected. A minimal box-sizing reset
 *    scoped to .gtm-scope lives in src/gtm/gtm.css instead.
 *  Theme mirrors GTM's original tailwind.config.ts exactly (dark navy + #6D5DFB brand).
 */
export default {
  content: ["./src/gtm/**/*.{ts,tsx,js,jsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      // Remapped from GTM's original navy/purple to the KiteAI platform palette, so
      // the merged agent matches the rest of the platform (teal accent, black base,
      // teal-tinted surface) without touching any component's className.
      colors: {
        primary: "#00F5D4", // KiteAI teal (was #6D5DFB)
        accent: "#00F5D4",
        canvas: "#000000", // platform base (was #0A0E1A)
        surface: "#0C1B26", // platform --surface (was #141A2E)
        ink: "#FFFFFF", // platform --text (pure white)
        muted: "#A1A1AA", // platform --text2
        line: "#1E2A35", // platform --border (was #2A3350)
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Match the platform's SHARP corners (App.css: --r-card 5px / --r-control 7px)
        // instead of GTM's original round style. Remaps the radius utilities GTM
        // actually uses (rounded-2xl on cards/panels, rounded-lg on inputs/buttons/
        // chips), so every component stays byte-for-byte unchanged.
        card: "5px",
        control: "7px",
        lg: "7px", // inputs, buttons, chips, textareas
        xl: "6px",
        "2xl": "5px", // cards / panels
        "3xl": "6px",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "ambient-drift": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "50%": { transform: "translate(-1.5%, 2%)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "ambient-drift": "ambient-drift 24s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
