/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,vue}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf2fb',
          100: '#fbe6f6',
          200: '#f6ccee',
          300: '#f0a2df',
          400: '#e66bc9',
          500: '#d63faf',
          600: '#b82a90',
          700: '#942173',
          800: '#781c5d',
          900: '#62194c',
          950: '#3b0a2d'
        }
      },
      fontFamily: {
        brand: ['Fredoka', 'system-ui', 'sans-serif'],
        display: ['Bungee', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
