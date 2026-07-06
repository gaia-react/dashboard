import gaiaLint from '@gaia-react/lint';
import {defineConfig} from 'eslint/config';

const lint = gaiaLint();

export default defineConfig([
  // Ignore the committed test-data dir (cost.jsonl/ledger/session fixtures).
  // These are hand-crafted sample data, not source, and some are deliberately
  // malformed. Without this, `eslint .` tries to compute config for the .jsonl
  // files and crashes: @gaia-react/lint sets rules under the import-x/react/
  // @stylistic namespaces in universal (no-`files`) config objects, but only
  // registers those plugins for JS/TS scopes, so a non-JS file has no matching
  // plugin. Mirrors gaia's own `lint.ignores({extra: ['.gaia/**']})`.
  ...lint.ignores({extra: ['test/fixtures/**']}),
  ...lint.base,
  ...lint.react,
  ...lint.testing,
  ...lint.styleHygiene,
  ...lint.guardrails,
  ...lint.betterTailwind({entryPoint: './app/styles/tailwind.css'}),
  ...lint.prettier,
]);
