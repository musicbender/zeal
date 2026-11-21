# node-chargepoint → zeal Migration — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT hand-edit the `version` field or `CHANGELOG.md` of `node-chargepoint` — the release workflow owns both.

**Goal:** Move the `node-chargepoint` library (currently `musicbender/node-chargepoint`) into zeal at `packages/node-chargepoint`, with full git history, using zeal's shared configs/tooling, still published to npm as `node-chargepoint`, with label-driven version bumps that apply **only** to that package.

**Architecture:**

- Package stays **unscoped and public** (`node-chargepoint`, MIT). It is the only publishable package in zeal; everything else stays `private`.
- It may use `@repo/eslint-config` and `@repo/typescript-config` (build-time only) but must **never** take a runtime `dependency` on a private `@repo/*` package.
- Build stays `tsup` (dual CJS/ESM + `chargepoint` CLI), output in `dist/` (already in turbo's `build.outputs`).
- gaspar consumes it as `workspace:*`; turbo builds it before anything that depends on it.
- Releases: a path-filtered workflow reads a `chargepoint:*` label from the merged PR, bumps `packages/node-chargepoint/package.json`, updates its CHANGELOG, tags `node-chargepoint@vX.Y.Z`, publishes to npm with provenance (zeal is public, so provenance works).

**Tech Stack:** pnpm 10 workspaces, Turborepo 2, tsup 8, vitest 4, msw 2, ESLint 9 flat config, `git filter-repo`, GitHub Actions, npm trusted publishing (OIDC).

---

## Decisions

**Confirmed by Pat:** D2 (`chargepoint:*` label prefix), D4 (bundle into gaspar), and renaming the e2e env vars to `CHARGEPOINT_*` (Task 4). Others are recommendations pending review.

| #   | Decision              | Recommendation                                                                                                                                                                                                                           |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | How to import history | `git filter-repo --to-subdirectory-filter` + merge with `--allow-unrelated-histories`. Paths are rewritten so `git log`/`blame` work naturally. The migration PR **must be merged with a merge commit**, not squash, or history is lost. |
| D2  | Release labels        | Package-prefixed: `chargepoint:patch`, `chargepoint:minor`, `chargepoint:major`, `chargepoint:skip-release`. Keeps the bump obviously scoped and leaves room for other publishable packages later.                                       |
| D3  | Tag format            | `node-chargepoint@vX.Y.Z`. Optionally re-import old `vX.Y.Z` tags renamed to this format.                                                                                                                                                |
| D4  | gaspar runtime        | Bundle `node-chargepoint` into gaspar's tsup output (add to `noExternal`) like `@repo/*`, so the Pi deploy doesn't depend on `pnpm deploy` copying a workspace package's `dist`.                                                         |
| D5  | Live dev loop         | `dev: tsup --watch` in the package so `pnpm dev` rebuilds `dist` while gaspar's `tsx --watch` picks it up. (Alternative later: a `source` export condition + `customConditions`.)                                                        |
| D6  | Old repo              | Freeze publishing, add "moved" notice, transfer open issues, archive.                                                                                                                                                                    |

---

## File Map

| Action | Path                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Import | `packages/node-chargepoint/**` (from old repo, with history)                                                                  |
| Delete | `packages/node-chargepoint/{pnpm-lock.yaml,pnpm-workspace.yaml,.github/,.gitignore}` (folded into root)                       |
| Modify | `packages/node-chargepoint/{package.json,tsconfig.json,eslint.config.js,CLAUDE.md,AGENTS.md,SECURITY.md,docs/development.md}` |
| Create | `packages/typescript-config/node-library.json`                                                                                |
| Modify | `turbo.json`                                                                                                                  |
| Modify | root `package.json` (`pnpm.onlyBuiltDependencies`, `pnpm.overrides`)                                                          |
| Modify | `.github/workflows/e2e.yml` (stop running library e2e by accident)                                                            |
| Create | `.github/workflows/node-chargepoint-labels.yml`                                                                               |
| Create | `.github/workflows/node-chargepoint-release.yml`                                                                              |
| Create | `.github/release.yml` (only if keeping generated notes — see Task 7)                                                          |
| Create | `.git-blame-ignore-revs`                                                                                                      |
| Modify | `apps/gaspar/package.json`, `apps/gaspar/tsup.config.ts`                                                                      |
| Modify | `CLAUDE.md`, `.claude/skills/chargepoint.md`, gaspar docs referencing `../node-chargepoint`                                   |

---

## Task 1: Import with history

- [ ] **Step 1:** Fresh clone of the library, fetch tags, rewrite paths

```bash
pip install git-filter-repo
git clone https://github.com/musicbender/node-chargepoint /tmp/ncp && cd /tmp/ncp
git fetch --tags
git filter-repo --to-subdirectory-filter packages/node-chargepoint \
  --tag-rename 'v:node-chargepoint@v'   # D3, optional
```

- [ ] **Step 2:** Merge into zeal on a branch

```bash
cd ~/zeal && git checkout -b chore/migrate-node-chargepoint
git remote add ncp /tmp/ncp && git fetch ncp --tags
git merge --allow-unrelated-histories ncp/main -m "chore: import node-chargepoint with history"
git remote remove ncp
```

- [ ] **Step 3:** Remove standalone-repo files now owned by the root: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.gitignore` (merge any unique entries into root `.gitignore`), `.github/` (workflows are rewritten in Task 7; `dependabot.yml` dropped unless zeal adopts Dependabot). Commit.

## Task 2: Package manifest

**File:** `packages/node-chargepoint/package.json`

- [ ] Keep: `name`, `version` (untouched), `description`, `keywords`, `license`, `type`, `main`/`module`/`types`/`exports`, `bin`, `files`, `engines.node: ">=22"` (consumer-facing; zeal itself runs 24).
- [ ] Repoint metadata:
  ```json
  "homepage": "https://github.com/musicbender/zeal/tree/main/packages/node-chargepoint#readme",
  "repository": { "type": "git", "url": "git+https://github.com/musicbender/zeal.git", "directory": "packages/node-chargepoint" },
  "bugs": { "url": "https://github.com/musicbender/zeal/issues" },
  "publishConfig": { "access": "public", "provenance": true }
  ```
- [ ] Remove `packageManager` (root owns it: pnpm 10) and `prepublishOnly` (the workflow builds explicitly).
- [ ] Scripts: add `"dev": "tsup --watch"`; lint becomes `"eslint src tests --max-warnings 0"` (the shared config uses `eslint-plugin-only-warn`, so without this lint can never fail).
- [ ] devDependencies — reuse monorepo versions:
  - add `@repo/eslint-config: workspace:*`, `@repo/typescript-config: workspace:*`
  - `eslint` 10 → `^9.31.0` (match workspace); drop `typescript-eslint` (comes via `@repo/eslint-config`)
  - `typescript` → `5.5.4` (root pin). If typecheck/dts fails on a 5.6+ feature, keep `^5.8` locally and note it.
  - `tsup` → `^8.5.1` (match gaspar), `vitest` `^4.1.0`, `@types/node` `^22` (already aligned)
  - drop `vite` if nothing imports it directly (vitest brings its own)
  - keep `msw`, `commander` (runtime dep)

## Task 3: Shared TS + ESLint config

- [ ] **Create** `packages/typescript-config/node-library.json` — reusable for any Node-only package (gaspar could adopt it later):
  ```json
  {
  	"$schema": "https://json.schemastore.org/tsconfig",
  	"extends": "./base.json",
  	"compilerOptions": {
  		"target": "ES2023",
  		"lib": ["ES2023"],
  		"module": "NodeNext",
  		"moduleResolution": "NodeNext",
  		"sourceMap": true
  	}
  }
  ```
  (base.json's `DOM` lib and `moduleResolution: node` are wrong for a Node ESM library that imports `../package.json` with import attributes.)
- [ ] **Rewrite** `packages/node-chargepoint/tsconfig.json`:
  ```json
  {
  	"extends": "@repo/typescript-config/node-library.json",
  	"compilerOptions": { "outDir": "./dist", "noUncheckedIndexedAccess": false },
  	"include": ["src/**/*", "tests/**/*"],
  	"exclude": ["node_modules", "dist"]
  }
  ```
  `noUncheckedIndexedAccess: false` preserves current behavior; enabling it (base default) is a follow-up.
- [ ] **Rewrite** `eslint.config.js`:
  ```js
  import { libraryConfig } from '@repo/eslint-config/library';
  export default libraryConfig;
  ```
- [ ] Keep `tsup.config.ts`, `vitest.config.ts`, `vitest.e2e.config.ts` as-is (package-specific: msw setup, dual build, CLI banner).

## Task 4: Root workspace wiring

- [ ] `pnpm-workspace.yaml`: no change (`packages/*` already covers it).
- [ ] Root `package.json` → `pnpm.onlyBuiltDependencies`: add `msw` (esbuild already there).
- [ ] Root `package.json` → `pnpm.overrides`: carry over `brace-expansion: ">=5.0.9"`, `nanoid: ">=3.3.18"` only if `pnpm audit --audit-level=high` still needs them.
- [ ] `turbo.json`:
  ```jsonc
  "typecheck":        { "dependsOn": ["^build"] },
  "test":             { "dependsOn": ["^build"] },
  "test:integration": { "dependsOn": ["^build"], "cache": false },
  "dev":              { "dependsOn": ["^build"], "cache": false, "persistent": true }
  ```
  Needed because node-chargepoint's `exports` point at `dist/` (it must, to be publishable), unlike the source-exporting `@repo/*` packages. Packages without a `build` script are unaffected.
- [ ] Turbo strict env: library e2e reads `CP_USERNAME`, `CP_PASSWORD`, `CP_TOKEN`. Either add those to `test:e2e.passThroughEnv`, or (confirmed) rename them in `tests/e2e` to the existing `CHARGEPOINT_USERNAME`/`CHARGEPOINT_PASSWORD`/`CHARGEPOINT_TOKEN` already in `globalEnv`.
- [ ] `.github/workflows/e2e.yml` runs `pnpm test:e2e --project=api` across the whole repo; scope it (`--filter=portfolio-e2e`) so it doesn't start hitting the live ChargePoint API.
- [ ] `pnpm install` → regenerate root lockfile. Commit.

## Task 5: Formatting pass (isolated commit)

- [ ] `pnpm prettier --write "packages/node-chargepoint/**/*.{ts,md,json}"` (zeal uses tabs; library uses spaces).
- [ ] Commit alone as `style(node-chargepoint): apply monorepo prettier config`, then add its SHA to `.git-blame-ignore-revs` in a follow-up commit.

## Task 6: Switch gaspar to the workspace package

- [ ] `apps/gaspar/package.json`: `"node-chargepoint": "workspace:*"`.
- [ ] `apps/gaspar/tsup.config.ts`: `noExternal: [/@repo\/.*/, 'node-chargepoint']` (D4).
- [ ] Verify: `pnpm turbo build typecheck test lint --filter=gaspar...` (the `...` includes node-chargepoint), plus `pnpm --filter node-chargepoint test`.
- [ ] Verify the Pi deploy path locally: `pnpm --filter=gaspar deploy --prod --legacy /tmp/g && node -e "import('/tmp/g/dist/main.js')"` resolves without a missing `node-chargepoint`.
- [ ] Note: changes under `packages/node-chargepoint` now mark gaspar affected, so `deploy-pi.yml` redeploys gaspar — intended.

## Task 7: Scoped release workflows

- [ ] **Create labels** in zeal: `chargepoint:patch`, `chargepoint:minor`, `chargepoint:major`, `chargepoint:skip-release`.

- [ ] **Create** `.github/workflows/node-chargepoint-labels.yml` — port of old `pr-labels.yml`:
  - `on: pull_request` (`opened, synchronize, reopened, labeled, unlabeled`) with `paths: ['packages/node-chargepoint/**']` so it only runs for PRs touching the library.
  - Require exactly one `chargepoint:*` label.

- [ ] **Create** `.github/workflows/node-chargepoint-release.yml` — port of old `publish.yml`, changes:
  - `on: push: branches: [main]`, `paths: ['packages/node-chargepoint/**']`; `concurrency: node-chargepoint-release`.
  - Keep the guard on release commits (`!startsWith(head_commit.message, 'chore(node-chargepoint): release')`).
  - Find merged PR → map `chargepoint:*` label → bump type; keep the pre-v1 "major → minor" rule.
  - `node-version: 24` (ships npm 11, required for OIDC trusted publishing), `registry-url: https://registry.npmjs.org`.
  - `pnpm install --frozen-lockfile` → `pnpm turbo run build typecheck test --filter=node-chargepoint`.
  - In `working-directory: packages/node-chargepoint`: `npm version $BUMP --no-git-tag-version`.
  - Release notes from **the triggering PR only** (title, number, author, link) — `gh release --generate-notes` would pull in every unrelated zeal PR since the last tag. Prepend `## [vX.Y.Z](https://github.com/musicbender/zeal/releases/tag/node-chargepoint@vX.Y.Z) — DATE` + notes to `packages/node-chargepoint/CHANGELOG.md`.
  - **One** commit for `package.json` + `CHANGELOG.md`: `chore(node-chargepoint): release vX.Y.Z [skip ci]` (also stops `deploy-pi` from redeploying for a version-only change), tag `node-chargepoint@vX.Y.Z`, push with `GH_PAT`.
  - Publish: `pnpm pack` (rewrites any `workspace:` ranges) then `npm publish ./node-chargepoint-X.Y.Z.tgz --provenance --access public`. **Never** plain `npm publish` from the directory.
  - `gh release create node-chargepoint@vX.Y.Z --title "node-chargepoint vX.Y.Z" --notes-file notes.md`.
  - Permissions: `contents: write`, `pull-requests: read`, `id-token: write`.

- [ ] **Secrets/settings (manual):** add `GH_PAT` (fine-grained, zeal contents: write) to zeal; if `main` is protected, allow it to push. On npmjs.com → `node-chargepoint` → Trusted Publishers: set repo `musicbender/zeal`, workflow `node-chargepoint-release.yml`.

- [ ] Everything else in zeal is untouched: no other package gets a version bump, label check, or publish step.

## Task 8: Docs & Claude context

- [ ] Root `CLAUDE.md`: add `node-chargepoint` to Shared Packages (note: published to npm, release via `chargepoint:*` labels, don't edit version/CHANGELOG); change the External Integrations line to `packages/node-chargepoint`; remove "source at `../node-chargepoint`".
- [ ] Keep `packages/node-chargepoint/CLAUDE.md` (versioning rule) and `AGENTS.md`; update label names.
- [ ] `.claude/skills/chargepoint.md`: `../node-chargepoint/src/types.ts` → `packages/node-chargepoint/src/types.ts`; drop "sibling repo".
- [ ] `docs/development.md`, `SECURITY.md`: repoint GitHub links to zeal.
- [ ] `grep -rn "\.\./node-chargepoint" .` and fix the rest (gaspar docs, specs).

## Task 9: Land & cut over

- [ ] Open the migration PR with label `chargepoint:skip-release`. Merge with **"Create a merge commit"** (D1).
- [ ] Old repo: disable/delete `publish.yml` first (no double publishing), README banner "Moved to musicbender/zeal/packages/node-chargepoint", transfer open issues/PRs, archive.
- [ ] First real release from zeal: small PR (e.g. README tweak) labeled `chargepoint:patch` → `0.12.2`. Check npm shows zeal as source, provenance badge, `git+https://github.com/musicbender/zeal.git` + `directory`, and `npx node-chargepoint --help` / `chargepoint` bin works from the published tarball.

## Rollback

Until Task 9's old-repo archive, nothing is irreversible: revert the merge in zeal, point gaspar back at `"node-chargepoint": "0.12.1"`, and re-point npm trusted publishing to the old repo.

---

## As built (deviations from the plan above)

- **Env var rename** applies to the e2e suite and its docs only. The `chargepoint` CLI still reads `CP_USERNAME` / `CP_PASSWORD` / `CP_TOKEN` — that is public interface for npm users, so renaming it would be a breaking change.
- **`turbo/no-undeclared-env-vars` is off for this package** (`eslint.config.js`): the CLI's `CP_*` and the opt-in `E2E_*` flags are runtime user inputs, not turbo task inputs. Needed because lint runs with `--max-warnings 0`.
- **`e2e.yml` needed no change** — its step already runs inside `apps/portfolio-e2e`.
- **No `.github/release.yml`** — release notes come from the merged PR, not GitHub's generated notes.
- **CHANGELOG bug not ported:** the old `publish.yml` did `tail -n +5 CHANGELOG.md`, which dropped the first four lines (the previous entry's header) on every release. The new workflow prepends without trimming; older entries in `CHANGELOG.md` remain headerless.
- **Pre-commit hook** typechecks all affected packages; gaspar needs `pnpm --filter gaspar prisma:generate` and `... exec prisma generate --schema=prisma/schema.test.prisma` run once in a fresh checkout.
- Imported `node-chargepoint@v*` tags exist locally only; they are pushed at cutover (Task 9), not with the branch.
