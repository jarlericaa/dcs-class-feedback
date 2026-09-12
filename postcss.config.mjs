/**
 * PostCSS, for Tailwind v4.
 *
 * Tailwind is being introduced incrementally: `globals.css` still carries the
 * hand-written system and is deleted class-by-class as each route is converted,
 * so both work at once and the app renders correctly at every commit in between.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
