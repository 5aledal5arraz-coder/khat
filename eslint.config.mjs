import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The react-hooks v6 "compiler" rules flag several patterns that are
    // correct at runtime (SSR mounted flags, server-prop → state sync,
    // subscription/hydration effects, stable-component-ref locals). Keep them
    // as WARNINGS — visible for incremental cleanup — so CI can gate on genuine
    // errors. rules-of-hooks / exhaustive-deps stay at error.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",

      // Two patterns this codebase uses on purpose were being reported as
      // dead code, which buries the genuinely dead code in the same list:
      //   • a leading underscore — the existing way of saying "this parameter
      //     exists to hold a position in the signature" (`_props`, `_full`);
      //   • `const { cards, notes, ...roomData } = snapshot` — naming a key
      //     precisely so the rest object does NOT carry it. The names are the
      //     omission; they are not meant to be read.
      // Both are now spelled out in the config instead of being ignored by
      // hand, so a real unused variable stays visible.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Wave 4: scripts/_archive holds historical one-off scripts that
    // are not part of the active test/build loop. Don't lint them.
    "scripts/_archive/**",
    // .claude holds agent worktrees (a duplicated repo checkout + large
    // build artifacts). Linting them produces thousands of phantom errors
    // from a copy that is not part of this project's source.
    ".claude/**",
    // scratchpad/ is gitignored throwaway working files (one-off probes an
    // agent wrote to answer a question). Linting them put `no-explicit-any`
    // ERRORS in the report for code that is not part of the project.
    "scratchpad/**",
  ]),
]);

export default eslintConfig;
