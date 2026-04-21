import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7ff",
          500: "#4f46e5",
          700: "#3730a3",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
