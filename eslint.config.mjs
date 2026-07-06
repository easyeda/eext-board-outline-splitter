export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      parser: {
        // @ts-expect-error - TypeScript ESLint parser
        "@typescript-eslint/parser": {
          project: "./tsconfig.json"
        }
      },
      globals: {
        eda: "readonly",
        EPCB_LayerId: "readonly",
        EDMT_EditorDocumentType: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
];
