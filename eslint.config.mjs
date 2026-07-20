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
  ]),
]);

export default eslintConfig;
