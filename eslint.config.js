import globals from "globals";

export default [
  {
    ignores: ["node_modules/**"],
  },
  {
    files: ["index.js", "lib/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        $: "readonly",
        jQuery: "readonly",
        pako: "readonly",
        toastr: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-undef": "error",
    },
  },
  {
    files: ["server-plugin/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "no-undef": "error",
    },
  },
];
