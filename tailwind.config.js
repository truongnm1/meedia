/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#facc15", // yellow-400
          hover: "#eab308",   // yellow-500
          dark: "#ca8a04",    // yellow-600
          light: "#fef08a",   // yellow-200
        }
      },
      fontFamily: {
        sans: [
          '"Manrope"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'sans-serif'
        ]
      }
    },
  },
  plugins: [],
}
