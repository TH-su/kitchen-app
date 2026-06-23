/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        maru: ['"Zen Maru Gothic"', '"Hiragino Maru Gothic ProN"', '"Kosugi Maru"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
