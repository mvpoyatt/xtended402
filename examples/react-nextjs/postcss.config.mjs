const config = {
  plugins: {
    "@tailwindcss/postcss": {
      content: [
        "./app/**/*.{js,ts,jsx,tsx}",
        "./node_modules/@xtended402/react/dist/**/*.js",
      ],
    },
  },
};

export default config;
