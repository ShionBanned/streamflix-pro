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
      transitionTimingFunction: {
        'nf-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'nf-spring': 'cubic-bezier(0.22, 1.25, 0.36, 1)',
        'nf-smooth': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
    },
  },
  plugins: [],
};
