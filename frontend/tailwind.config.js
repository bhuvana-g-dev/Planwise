/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Celebration identity: warm golden/amber accent.
        brand: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },
        // Warm ivory / cream surfaces.
        sand: {
          50: "#fdfcf9",
          100: "#f8f5ef",
          200: "#efe9dd",
          300: "#e4dbc9",
        },
        // Secondary elegant accent (rose/plum) for weddings & highlights.
        plum: {
          50: "#fdf2f8",
          100: "#fce7f3",
          400: "#e879a6",
          500: "#db2777",
          600: "#be185d",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(120,90,20,0.05), 0 10px 30px rgba(120,90,20,0.07)",
        lift: "0 10px 40px rgba(217,119,6,0.18)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Avenir", "Helvetica", "Arial", "sans-serif"],
        display: ["Fraunces", "Georgia", "Cambria", "serif"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.3s cubic-bezier(0.22,1,0.36,1) both",
        float: "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
