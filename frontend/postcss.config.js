// Added for the GTM agent's scoped Tailwind build. Tailwind only injects utilities
// into files that contain @tailwind directives (src/gtm/gtm.css); the rest of the
// platform CSS (App.css) has none, so it passes through untouched (autoprefixer only).
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
