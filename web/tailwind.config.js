/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1E2A54',
          light: '#2C3A6B',
        },
        primary: {
          DEFAULT: '#2F5BD8',
          hover: '#2449B5',
          light: '#EEF3FE',
        },
        canvas: '#F6F8FC',
        line: '#E8EDF5',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'IBM Plex Mono',
          'ui-monospace',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};
