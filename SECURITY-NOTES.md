# Security Notes

This file tracks known, accepted dependency risks for `openbadges-badgekit`
(the front-end app) and records what was checked as part of the Task 4.4
security pass (production secrets fail-fast, cookie/CSRF hardening, and
`npm audit`).

## `npm audit --omit=dev` — result

As of this pass, `npm audit --omit=dev` reports **23 vulnerabilities**
(3 moderate, 12 high, 8 critical) — down from an initial **32**
(1 low, 4 moderate, 19 high, 8 critical) after removing the dead
`express-monkey-patch` dependency (see "Resolved" below). `npm audit fix`
(no `--force`) was also attempted; it rewrote `package-lock.json` (mostly
de-duplicating `badgekit-api-client`'s nested `node_modules` entries into
top-level ones) but the vulnerability count was **identical before and
after** (32 → 32) — i.e. it made no real remediation, just lockfile churn.
That change was reverted rather than committed, since it doesn't fix
anything and adds unrelated diff noise. No remaining HIGH/CRITICAL finding
in this tree is resolvable by a minor/patch bump or by dropping more dead
code; every real fix left requires `--force` and a breaking major-version
bump. Each accepted item is below.

## Resolved

### `express-monkey-patch` (dead dependency, was pulling in `express@3.4.8`/`connect@2.12.0`)

`express-monkey-patch@~0.1.1` was a leftover dependency from before the app
moved to Express 4's native named-routes support (see the comment atop
`app/lib/named-routes.js`: "Express 4 replacement for express-monkey-patch
(which subclassed the ..."). It was no longer `require()`d anywhere in the
codebase (confirmed via `grep -rn "express-monkey-patch" app test`), yet it
still pinned its own nested `express@3.4.8`, which pulled in an ancient
`connect@2.12.0` and that version's vulnerable `cookie`, `cookie-signature`,
`debug`, `fresh`, `multiparty`, `negotiator`, and `send`.

**Fix:** `npm uninstall express-monkey-patch`. Removed from `package.json`
`dependencies`; `package-lock.json` updated accordingly (50 packages
removed, 14 added — net removal, since nothing else depended on the express
3.x subtree).

**Before/after (`npm audit --omit=dev`):** 32 vulnerabilities
(1 low, 4 moderate, 19 high, 8 critical) → 23 vulnerabilities
(3 moderate, 12 high, 8 critical). The entire `connect`/`express@3.4.8`
chain (8 distinct advisory groups: `connect`, `cookie`, `cookie-signature`,
`debug`, `fresh`, `multiparty`, `negotiator`, `send`) is gone, along with
the "1 low" category.

Verified after removal: full test suite still passes (8/8, `mocha`) and the
dev server still boots and serves `/` correctly (see verification section
of the task report) — confirming the dependency was in fact unused.

### `badgekit-api-client` — flagged as "Malware" (critical) — investigated, believed to be a name-collision false positive

This is the most alarming-looking finding, so it got the most scrutiny.
`npm audit` flags **GHSA-7r6v-32g9-86gw** ("Malware in badgekit-api-client",
all versions, no fix) against our dependency. However:

- Our dependency is **not resolved from the npm registry at all** — it's a
  git dependency pinned to an immutable commit SHA on a maintained fork:
  `git+ssh://git@github.com/w3cdotorg/badgekit-api-client.git#1780452ae0c639748926f3fdc34ad3667dd89d74`
  (pinned in commit `edf5c9c`, "fix: pin badgekit-api-client to an immutable
  commit SHA"). `npm audit` matches advisories by **package name**
  regardless of resolution source, so a git-sourced package can be flagged
  by an advisory that was actually filed against a same-named package
  published to the npm registry.
- Inspected the installed contents (`node_modules/badgekit-api-client`):
  `package.json` shows author "Mozilla OpenBadges", license MPLv2, repo/
  homepage pointing at `github.com/mozilla/badgekit-api-client` (the
  original upstream). No install/postinstall/preinstall scripts. Source is
  a small, readable client (`index.js`, `lib/client.js`, `lib/remote.js`,
  `methods/*.js`, `models/*.js`) — grepped for `eval(`, `child_process`,
  `exec(`, `Function(`, `atob(`; the only hit was a legitimate
  `fs.readFileSync(...).toString('base64')` used to build a `data:` URI for
  image uploads (`lib/remote.js`), not obfuscated/exfiltration code.
  Its actual dependencies (`jws@~0.2.5`, `mime@~1.2.11`, `request@~2.31.0`)
  are old-but-legitimate packages, and `request`'s own transitive tree
  (`hawk`, `hoek`, `boom`, `cryptiles`, `tough-cookie`, `tunnel-agent`,
  `form-data`, `qs`) accounts for essentially every other CVE this audit
  reports as coming through `badgekit-api-client` — consistent with "old,
  unmaintained legacy client" risk, not "actively malicious package."
- **Conclusion:** treated as a name-collision false positive against our
  git-pinned fork, not evidence the code we ship is compromised. This is
  still flagged here explicitly rather than silently dismissed, in case
  future re-review turns up new evidence. **Action recommended:** replace
  `badgekit-api-client` with a client built on the native `fetch`-based
  pattern already used elsewhere in this codebase (see the "replace
  deprecated request with native fetch" commits in both repos) — this
  removes the `request`/`hawk`/`tough-cookie`/`form-data` legacy chain
  entirely and eliminates the name-collision ambiguity for good. Tracked as
  follow-up, out of scope for this pass.

### `db-migrate` 0.6.x pin — `moment`, `semver`, `serialize-javascript`/`mocha` chain (high)

Same rationale as the API repo: `db-migrate` is intentionally pinned to
`~0.6.3` to avoid a migration-API rewrite. Fixing needs
`db-migrate@0.11.14` via `--force`. **Accepted risk:** migrations run at
deploy/ops time against operator-controlled input, not on the
request-serving path.

### `optimist` — via `minimist`, pulled in by `config-store` (critical)

`config-store` (used for all app configuration, see `app/lib/config.js`)
depends on `optimist`, which depends on vulnerable `minimist` (prototype
pollution via crafted CLI args). **Accepted risk:** exploitation requires
attacker-controlled CLI arguments to the Node process, which is not part of
this app's threat model (the process is started with fixed, operator-chosen
arguments, not variable/untrusted ones). No non-breaking fix is available.

### `underscore` (critical) — via `messina` (GELF logging, optional)

Only pulled in when `ENABLE_GELF_LOGS=true` (see `app/index.js`). Fixing
requires `messina@0.0.1` via `--force`. **Accepted risk:** GELF logging is
opt-in and off by default (`sample.env` / `.env` both set
`ENABLE_GELF_LOGS=false`); revisit if/when GELF logging is actually enabled
in a deployment.

### No-fix-available items (accepted as unavoidable without a dependency swap)

`hawk`, `hoek`/`boom`/`cryptiles`, `mime` (<1.4.1, via `badgekit-api-client`'s
pinned `request`), `tough-cookie`, `tunnel-agent`, `qs`, `base64url`/`jwa`/
`jws` (<=3.2.2) — all transitive dependencies of the legacy `request` HTTP
client pulled in by `badgekit-api-client` (see above). No registry fix
exists for these old versions; the real remediation is removing the
`request`-based client, tracked as the same follow-up noted above.

## What changed in this pass

- **`app/index.js`** — fail-fast check: when `NODE_ENV=production`,
  `COOKIE_SECRET`, `OPENBADGER_SECRET`, and `API_SECRET` must each not be
  unset, empty, a known weak/placeholder dev value (`devsecret`,
  `dev-cookie-secret`, `dev-api-secret`, `blah`), or shorter than 32
  characters. Throws immediately at boot rather than silently running
  production with a dev-grade or trivially brute-forceable secret. Only
  applies to `NODE_ENV=production` — `test`/`development` boots are
  unaffected.
- **`app/middleware/index.js`** — session cookie hardening:
  - Fixed a real bug: `client-sessions` has **no top-level `maxAge`
    option**. The previous config set `maxAge` as a sibling of `cookie`
    (not `cookie.maxAge`), which `client-sessions` silently ignores — so
    the "one week" session lifetime was never actually applied, and
    sessions were falling back to the library's 24h `duration` default.
    Replaced with the real option, `duration: 7*24*60*60*1000`. Verified
    live: `Set-Cookie` now carries `expires=` ~7 days out instead of ~24h
    (see verification section of the task report).
  - Left `activeDuration` at the library default (5 minutes) rather than
    setting it explicitly — that default already provides a sensible
    rolling-extension window for active users near expiry without
    introducing a new tunable; no evidence it needs to be longer.
  - `cookie.httpOnly: true` (already present, kept).
  - Added `cookie.sameSite: 'lax'` — mitigates CSRF via cross-site
    navigation while still allowing top-level GET navigations (login links,
    etc.) to carry the session.
  - Added `cookie.secureProxy: SECURE_COOKIES` — marks the cookie `Secure`
    (HTTPS-only) when running behind TLS (directly or via a
    TLS-terminating proxy/load balancer), configurable via the new
    `SECURE_COOKIES` env var (documented in `sample.env`, defaults to
    `false` for local HTTP dev). `secureProxy` (rather than `secure`) is
    used deliberately: `client-sessions` itself refuses to start with
    `cookie.secure: true` unless it can detect an actually-encrypted socket,
    which breaks behind a TLS-terminating proxy; `secureProxy` is a
    supported option on the underlying `cookies` package that sets the
    `Secure` attribute without that same-process TLS-detection check.
    **Fixed in a follow-up round:** `config()` returns raw env values, which
    are always strings when set via the environment — `SECURE_COOKIES=false`
    yields the *string* `'false'`, which is truthy in JS, so a bare
    `config('SECURE_COOKIES', false)` passed straight into `secureProxy`
    would have marked the cookie Secure over plain HTTP for any exported
    value, breaking session persistence on non-TLS deployments. Now coerced
    explicitly: `SECURE_COOKIES = SECURE_COOKIES === true || SECURE_COOKIES
    === 'true'`. Verified empirically both ways — booted the dev server
    with `SECURE_COOKIES=false` exported and confirmed via `curl -i` that
    `Set-Cookie` has no `secure` attribute; then with `SECURE_COOKIES=true`
    and confirmed `secure` is present.
- **`app/middleware/csrf.js`** — CSRF token generation was using
  `Math.random()` (non-cryptographic PRNG) via a hand-rolled `uid()`/
  `getRandomInt()`. Replaced with `crypto.randomBytes(len).toString('hex')`.
  Since CSRF tokens are only ever compared for equality (`val != token`),
  the alphabet doesn't matter — plain hex from a CSPRNG is sufficient.
  Confirmed no other call sites depend on `uid`/`getRandomInt` or their
  specific alphabet (grepped `app/`, `test/`, excluding vendored static
  client-side JS under `app/static/js/`).
- **`sample.env`** — documented the new `SECURE_COOKIES` variable
  (`SECURE_COOKIES=false`, comment: "set true behind TLS").
