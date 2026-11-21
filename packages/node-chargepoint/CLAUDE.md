# Claude Code notes

## Versioning

Do NOT manually edit the `"version"` field in `package.json` or add entries to `CHANGELOG.md`.
Version bumps and changelog entries are automated by `.github/workflows/node-chargepoint-release.yml`.

PRs that change this package need exactly one label (enforced by `node-chargepoint-labels.yml`):
`chargepoint:patch`, `chargepoint:minor`, `chargepoint:major`, or `chargepoint:skip-release`.
Other packages in the monorepo are not versioned or published.

## Rules

- Never add a runtime `dependency` on a private `@repo/*` package (this package is published to npm).
  `@repo/eslint-config` and `@repo/typescript-config` as devDependencies are fine.
- The CLI reads `CP_USERNAME` / `CP_PASSWORD` / `CP_TOKEN` (public interface — don't rename).
  The e2e suite reads `CHARGEPOINT_USERNAME` / `CHARGEPOINT_PASSWORD` / `CHARGEPOINT_TOKEN`.
