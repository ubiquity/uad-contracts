module.exports = {
  root: true,
  extends: [
    "airbnb-typescript/base",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:prettier/recommended",
    "prettier",
  ],
  parserOptions: {
    project: "./tsconfig.eslint.json",
  },
  ignorePatterns: ["**/artifacts", "**/coverage"],
  rules: {
    // helps code clarity
    "@typescript-eslint/comma-dangle": "off",
    // we prefer double quotes and backticks
    "@typescript-eslint/quotes": "off",
    // we use it for scripts
    "no-console": "off",
    // we use it for tests
    "func-names": "off",
    // we use it for tests
    "import/no-extraneous-dependencies": "off",
    // we use it for tests
    "@typescript-eslint/no-unused-expressions": "off",
  },
};
