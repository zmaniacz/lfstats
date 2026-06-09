module.exports = {
  root: true,
  ignorePatterns: ["**/dist/**", "**/.turbo/**", "**/node_modules/**"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["prettier"],
  rules: {
    // Add shared rules here if needed
  },
};
