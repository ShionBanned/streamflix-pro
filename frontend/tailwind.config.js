/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        netflix: {
          red: '#E50914',
          darkRed: '#B81D24',
          black: '#141414',
          dark: '#0b0b0b',
          card: '#181818',
          hover: '#282828',
          gray: '#808080',
          lightGray: '#e5e5e5',
        },
      },
      fontFamily: {
        sans: ['Netflix Sans', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        netflix: ['Netflix Sans', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
