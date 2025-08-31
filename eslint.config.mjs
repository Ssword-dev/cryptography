// eslint.config.js
import tseslint from "typescript-eslint";

export default [
  // base recommended configs
  ...tseslint.configs.recommended,

  {
    files: ["**/*.ts"],

    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },

    rules: {
      /* general */
      "no-unused-vars": "off",

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          // ignore variables starting with underscore
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      "no-console": "off",

      /* typescript strictness */
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",

      /* node/pnp specific */
      "import/no-unresolved": "off",
    },
  },

  {
    ignores: [
      "dist/**/*",
      ".yarn/**/*",
      ".pnp.cjs",
      ".pnp.loader.mjs",
      "build.mjs",
    ],
  },
];
