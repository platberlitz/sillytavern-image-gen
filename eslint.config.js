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
      // Browser dialogs are unstyleable, block the thread, and ignore the
      // SillyTavern theme. Use qigConfirm / qigNotice / qigInput / qigChoice,
      // which route through lib/st-dialogs.js.
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use qigConfirm() so the dialog matches SillyTavern's popups." },
        { name: "alert", message: "Use qigNotice() so the dialog matches SillyTavern's popups." },
        { name: "prompt", message: "Use qigInput() or qigChoice() so the dialog matches SillyTavern's popups." },
      ],
      // `toastr` is a bare global: reading it before SillyTavern defines it throws
      // a ReferenceError, and `toastr?.x?.()` does not protect an undeclared
      // binding. lib/notifications.js does the typeof check once and escapes by
      // default, so every notification goes through qigToast.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='toastr']",
          message: "Use qigToast (lib/notifications.js) instead of touching the toastr global directly.",
        },
      ],
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
