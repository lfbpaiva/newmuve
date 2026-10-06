import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // vite.config.ts é o scaffold gerado pelo Figma Make.
  // mobile/ tem o próprio TypeScript e dependências (Expo).
  { ignores: ["dist", "node_modules", ".figma", "vite.config.ts", "mobile", ".agents", ".claude"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["*.config.{js,ts}", "backend/**/*.ts", "scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
