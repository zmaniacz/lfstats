module.exports = {
  extends: ["../../.eslintrc.js", "prettier"],
  env: {
    node: true,
  },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-var-requires": "off",
    "no-console": "off",
  },
};
