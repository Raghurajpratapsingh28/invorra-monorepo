/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101916',
        paper: '#f4f2ec',
        mist: '#fbfaf7',
        line: '#e3dcd0',
        copper: '#b4532a',
        moss: '#166534',
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 1px rgba(16, 25, 22, 0.04), 0 10px 28px rgba(16, 25, 22, 0.045)',
        pop: '0 18px 50px rgba(16, 25, 22, 0.18)',
      },
    },
  },
  plugins: [],
};
