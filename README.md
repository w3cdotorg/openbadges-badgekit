# BadgeKit

> **2026 resurrection.** This fork of [mozilla/openbadges-badgekit](https://github.com/mozilla/openbadges-badgekit) has been modernized to run on Node.js ≥ 18 (developed and tested on Node 26) with MySQL 8. Mozilla's hosted BadgeKit beta and the Persona login service were shut down years ago — the historical links below are kept for context only. Login is now handled by a pluggable auth layer (`AUTH_MODE`: unverified dev prompt, or OpenID Connect). The easiest way to run the full stack locally is [w3cdotorg/badgekit-stack](https://github.com/w3cdotorg/badgekit-stack) (Docker Compose: MySQL + API + this web app + Keycloak).

BadgeKit is a software tool for issuing Open Badges. With BadgeKit, Mozilla aimed to make it easier to get started badging by providing lightweight, modular, open options for the community of badge issuers. The BadgeKit private beta was launched in March 2014, offering badge issuing organizations hosted access to the tools. That hosted service no longer exists; you host your own instance using the code in this repo.

## Background

BadgeKit is framed around a set of action verbs. Each verb represents an invitation to innovation around defining and refining the user experience for the particular action that the user is attempting to do. Here are the verbs: Build, Assess, Issue, Collect, Share, Discover and Use.

BadgeKit evolved out of several years of work in the badging field as well as LOTS of user testing and research. Much of BadgeKit was inspired by the work done for the Chicago Summer of Learning, the Connected Educators Month and the Mozilla Summit (2013–2014 era).

## Using BadgeKit

BadgeKit is made up of two distinct parts: an API and a Web app. This repo hosts the Web app.

The BadgeKit Web app is an admin tool for badge issuers - it lets issuer personnel create badges, defining their metadata and designing their appearance, as well as publishing and issuing them. BadgeKit also provides badge application management for issuers. The app doesn't actually store the data for the badges published through it - this is handled by the API. To install your own instance of BadgeKit, you therefore need the code in this repo and the [BadgeKit API repo](https://github.com/w3cdotorg/badgekit-api).

The BadgeKit API handles the data associated with published badges. You can call on the API webhooks to provide a custom front-end interface for your community of badge earners, so that you control the interaction and communication with them, while the BadgeKit app provides back-end badge issuing admin.

__You can run the BadgeKit API without the Web app, but the Web app depends on a running installation of the API.__

## Running the full stack with Docker (recommended)

[w3cdotorg/badgekit-stack](https://github.com/w3cdotorg/badgekit-stack) orchestrates MySQL 8, the API, this web app and an optional Keycloak (for OIDC login) with Docker Compose:

```sh
git clone https://github.com/w3cdotorg/badgekit-stack
git clone https://github.com/w3cdotorg/badgekit-api
git clone https://github.com/w3cdotorg/openbadges-badgekit
cd badgekit-stack
docker compose up -d --build
./seed.sh
```

Then open http://localhost:3001. See the stack's README for seeding details, the Keycloak/OIDC setup and known caveats. This repo also ships a `Dockerfile` used by the stack's build context.

## Setup

BadgeKit can be configured using three different methods (in order of priority):

 * command line arguments
 * a JSON configuration file
 * environment variables

These can be accessed within the app like so:

```
var config = require('./lib/config');

var port = config('PORT', 3000);
var cookie_secret = config('COOKIE_SECRET');
```

If a default value is given, it will be returned if not found elsewhere in the configuration. If it is not given, and no value is found, a `ReferenceError` will be thrown.

**Command line arguments**

Pass these in when starting the app, like so:

```
> node app --port 3456 --cookieSecret chocolatechips
```

**JSON configuration**

If the app finds a `config.json` file in the root, it will use parameters in this file where possible.

```
{
  "PORT": 3456,
  "COOKIE_SECRET": "chocolatechips"
}
```

**Environment variables**

Finally, configuration will be picked up from the environment. This is most easily done by writing a `config.env` file (or similar):

```
export PORT=3456
export COOKIE_SECRET='chocolatechips'
```

Then you can source the file like `. config.env`.

### App Environment

The following environment variables are currently used:

- COOKIE_SECRET: Should be a large, unguessable string. _Required_
- PORT: The port that the BadgeKit server should listen on. Defaults to 3000.
- OPENBADGER_URL: The URL of the BadgeKit API that this application should talk to. _Required_
- OPENBADGER_SECRET: The shared secret defined by the BadgeKit API (its `MASTER_SECRET`). _Required_
- OPENBADGER_SYSTEM: The default system slug to use in the BadgeKit API. _Required_
- DATABASE_DRIVER: Database driver. Required, currently only MySQL supported.
- PERSONA_AUDIENCE: Historical name, still required: the public base URL of this app (example: "http://localhost:3001"). Used to build absolute badge image, criteria and share URLs. _Required_
- ACCESS_LIST: An array of regular expressions that define "administrator" email patterns.  e.g. ["^edogg@example.org$"].  These users will automatically be members of the OPENBADGER_SYSTEM system.
- API_SECRET: A string used as a shared secret for BadgeKit's API functions (currently this is only add/delete user functionality). _Required_
- BRANDING: A short string used by the badge studio to add a label to the branding ribbon. Alternatively, this can be an object keyed by `system` slug.
- DEBUG: If set to true, enables additional logging. Defaults to false.
- SECURE_COOKIES: Set to true when serving over HTTPS (or behind a TLS-terminating proxy) so session cookies are marked secure. Defaults to false.

### Authentication

Mozilla Persona was shut down in 2016. The login layer is now selected with `AUTH_MODE`:

- AUTH_MODE: `dev` (default) or `oidc`. In `dev` mode, "Log In" prompts for an email address with **no verification** - local development only. In production (`NODE_ENV=production`) the app refuses to boot in dev mode unless `ALLOW_DEV_AUTH_IN_PRODUCTION=true` is set explicitly (break-glass/staging only).

When `AUTH_MODE=oidc`, the following are all required (the app fails fast if any is missing):

- OIDC_ISSUER: Issuer URL of your OpenID Connect provider (example: "http://localhost:8180/realms/badgekit" for the stack's Keycloak).
- OIDC_CLIENT_ID: OIDC client id.
- OIDC_CLIENT_SECRET: OIDC client secret.
- OIDC_REDIRECT_URI: Callback URL, must be registered with the provider (example: "http://localhost:3001/auth/callback").

The provider must return a verified email claim; the email is then matched against `ACCESS_LIST` as before.

For a MySQL database, you'll also want to set:

- DATABASE_HOST: Database host. Defaults to localhost.
- DATABASE_USER: Database user.
- DATABASE_PASSWORD: Database password.
- DATABASE_DATABASE: Name of the database to use.

### Tests

Tests can be run with `npm test` (mocha). They also run in CI (GitHub Actions) on every push and pull request.

You will need to define the following configuration parameters through one of the
methods outlined above. **Use a dedicated database: the test suite drops and recreates it.**

- TEST_DATABASE_DRIVER: Database driver. Required, currently only MySQL supported.
- TEST_DATABASE_HOST: Database host. Defaults to localhost.
- TEST_DATABASE_USER: Database user (needs global CREATE/DROP privileges).
- TEST_DATABASE_PASSWORD: Database password.
- TEST_DATABASE_DATABASE: Name of the database to use.
