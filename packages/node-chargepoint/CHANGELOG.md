## [v0.8.1](https://github.com/musicbender/node-chargepoint/releases/tag/v0.8.1) — 2026-05-31

<!-- Release notes generated using configuration in .github/release.yml at v0.8.1 -->

## What's Changed
### Bug Fixes & Patches
* fix(session): add NoActiveSessionError for errorId 165 and use start-ack session ID by @musicbender in https://github.com/musicbender/node-chargepoint/pull/30


**Full Changelog**: https://github.com/musicbender/node-chargepoint/compare/v0.8.0...v0.8.1

---

## What's Changed
### New Features
* Add stopChargingSession(deviceId) and ChargerBusyError by @musicbender in https://github.com/musicbender/node-chargepoint/pull/29


**Full Changelog**: https://github.com/musicbender/node-chargepoint/compare/v0.7.0...v0.8.0

---

## What's Changed
### New Features
* feat(utils): add isWithinChargeScheduleWindow utility by @musicbender in https://github.com/musicbender/node-chargepoint/pull/28


**Full Changelog**: https://github.com/musicbender/node-chargepoint/compare/v0.6.0...v0.7.0

---

## What's Changed
### New Features
* Add onTokenRotated callback, ChargingStatus type, and explicit TechnicalInfo field mapping by @musicbender in https://github.com/musicbender/node-chargepoint/pull/27


**Full Changelog**: https://github.com/musicbender/node-chargepoint/compare/v0.5.0...v0.6.0

---

## What's Changed
### New Features
* fix(session): distinguish start-command success from poll timeout with StartVerificationTimeoutError by @musicbender in https://github.com/musicbender/node-chargepoint/pull/26


**Full Changelog**: https://github.com/musicbender/node-chargepoint/compare/v0.4.2...v0.5.0

---

## What's Changed
### Bug Fixes & Patches
* Feat/power source config by @musicbender in https://github.com/musicbender/node-chargepoint/pull/25


**Full Changelog**: https://github.com/musicbender/node-chargepoint/compare/v0.4.1...v0.4.2

---

## What's Changed
### Bug Fixes & Patches
* fix captcha handling by @musicbender in https://github.com/musicbender/node-chargepoint/pull/23
### Other Changes
* docs: add pre-release status badges and warning to README by @musicbender in https://github.com/musicbender/node-chargepoint/pull/22


**Full Changelog**: https://github.com/musicbender/node-chargepoint/compare/v0.4.0...v0.4.1

---

## What's Changed
### New Features
* Harden public API, add SECURITY.md, CHANGELOG automation, and CI audit by @musicbender in https://github.com/musicbender/node-chargepoint/pull/21


**Full Changelog**: https://github.com/musicbender/node-chargepoint/compare/v0.3.5...v0.4.0

---

---

## [v0.3.5](https://github.com/musicbender/node-chargepoint/releases/tag/v0.3.5) — 2026-05-10

### Bug Fixes & Patches
- Add Postman collection, import guide, and dynamic VERSION ([#20](https://github.com/musicbender/node-chargepoint/pull/20))

---

## [v0.3.4](https://github.com/musicbender/node-chargepoint/releases/tag/v0.3.4) — 2026-05-10

### Bug Fixes & Patches
- Fix mutating home charger API requests and e2e tests ([#19](https://github.com/musicbender/node-chargepoint/pull/19))

---

## [v0.3.3](https://github.com/musicbender/node-chargepoint/releases/tag/v0.3.3) — 2026-05-10

### New Features
- Add publish workflow with label-based versioning and GitHub Releases ([#12](https://github.com/musicbender/node-chargepoint/pull/12))
- Fix publish workflow for branch protection compatibility ([#13](https://github.com/musicbender/node-chargepoint/pull/13))
- Switch from pnpm publish to npm publish for provenance support ([#15](https://github.com/musicbender/node-chargepoint/pull/15))

### Bug Fixes & Patches
- Fix bin path missing `./` prefix ([#16](https://github.com/musicbender/node-chargepoint/pull/16))
- Switch to npm trusted publishing via OIDC ([#17](https://github.com/musicbender/node-chargepoint/pull/17))
- Fix lightweight tag not being pushed to remote ([#18](https://github.com/musicbender/node-chargepoint/pull/18))

### Other Changes
- Add README.md and AGENTS.md ([#1](https://github.com/musicbender/node-chargepoint/pull/1))
- Add E2E test suite for real-charger validation ([#2](https://github.com/musicbender/node-chargepoint/pull/2))
- Add PR validation workflow and fix CI ([#11](https://github.com/musicbender/node-chargepoint/pull/11))
- Set npm as the package ecosystem for Dependabot ([#5](https://github.com/musicbender/node-chargepoint/pull/5))
