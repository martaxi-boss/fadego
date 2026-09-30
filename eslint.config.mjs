import nextPlugin from "eslint-config-next";

const config = [
  {
    ignores: [".next/**", "node_modules/**"],
  },
  ...nextPlugin,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-unused-vars": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    rules: {
      "no-unused-vars": "error",
    },
  },
];

export default config;
