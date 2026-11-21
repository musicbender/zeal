# Security Policy

## Supported Versions

Only the latest stable release receives security fixes. This library is pre-v1 (`0.x.y`) — no long-term support branches exist.

| Version | Supported |
|---|---|
| Latest `0.x.y` | Yes |
| Older releases | No |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Use GitHub's private vulnerability reporting:
**[Report a vulnerability](https://github.com/musicbender/node-chargepoint/security/advisories/new)**

You can expect an acknowledgment within 72 hours and a fix or mitigation plan within 14 days for confirmed vulnerabilities.

## Token Handling Notes

This library manages `coulomb_sess` session tokens on behalf of users:

- Tokens are stored in memory only and are never written to disk by this library.
- The `coulomb_sess` token is long-lived. Treat it like a password.
- **Never log request headers.** The `cp-session-token` and `cookie` headers carry the raw token value. Passing `debug` callbacks should never forward header content to external systems.
- If a token is compromised, log in to [driver.chargepoint.com](https://driver.chargepoint.com) and invalidate your session.
