import { libraryConfig } from '@repo/eslint-config/library';

export default [
  ...libraryConfig,
  {
    // CP_* (CLI) and E2E_* (opt-in e2e flags) are runtime/user env vars for a published
    // package, not turbo task inputs — the e2e task is uncached.
    rules: { 'turbo/no-undeclared-env-vars': 'off' },
  },
];
