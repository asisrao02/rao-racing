/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Orbitron", "sans-serif"],
        body: ["Rajdhani", "sans-serif"],
      },
      colors: {
        track: {
          bg: "#07111e",
          panel: "#0f1f34",
          accent: "#ff4f1f",
          neon: "#4cf8ff",
        },
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(76, 248, 255, 0.4), 0 14px 40px rgba(0, 0, 0, 0.4)",
      },
    },
  },
  plugins: [],
};
