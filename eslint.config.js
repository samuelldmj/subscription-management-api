import { defineConfig } from "eslint/config"; // Assuming this is the correct import (see note below)
import globals from "globals";
import js from "@eslint/js";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node, // Use Node.js globals (includes `process`)
      },
      sourceType: "module", // Support ES modules (import/export)
    },
    rules: {
      ...js.configs.recommended.rules, // Apply recommended JS rules
    },
  },
]);