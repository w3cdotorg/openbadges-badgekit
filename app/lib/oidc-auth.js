// Auth OIDC derrière l'interface historique d'express-persona-observer.
// openid-client est épinglé en v5 : la v6 est ESM-only et l'app est CommonJS.
const { Issuer, generators } = require('openid-client');

var redirects = {};
var clientPromise = null;

exports.ensureLoggedIn = function ensureLoggedIn (path) {
  return function (req, res, next) {
    var redirectPath = path || redirects.notLoggedIn;
    if (!req.fromLoggedInUser()) {
      if (redirectPath) return res.redirect(303, redirectPath);
      return next('Not logged in');
    }
    return next();
  };
};

exports.ensureLoggedOut = function ensureLoggedOut (path) {
  return function (req, res, next) {
    var redirectPath = path || redirects.notLoggedOut;
    if (req.fromLoggedInUser()) {
      if (redirectPath) return res.redirect(303, redirectPath);
      return next('Logged in');
    }
    return next();
  };
};

exports.express = function (app, config) {
  config = config || {};
  var sessionKey = config.sessionKey || 'email';
  var selectors = config.selectors || {};
  var loginSelector = selectors.login || '#login';
  var logoutSelector = selectors.logout || '#logout';
  var loginjsPath = config.loginjsPath || '/persona/login.js';
  var extraMiddleware = config.middleware || function (req, res, next) { next(); };
  redirects = config.redirects || {};

  var issuerUrl = process.env.OIDC_ISSUER;
  var redirectUri = process.env.OIDC_REDIRECT_URI;

  // Fail fast: this module is only required when AUTH_MODE=oidc, i.e. real
  // deployments. A missing config var should crash at startup, not surface
  // as a confusing failure on the first user's login attempt.
  var missingEnv = ['OIDC_ISSUER', 'OIDC_REDIRECT_URI', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'].filter(function (name) {
    return !process.env[name];
  });
  if (missingEnv.length) {
    throw new Error('oidc-auth: missing required environment variable(s): ' + missingEnv.join(', '));
  }

  function getClient () {
    if (!clientPromise) {
      clientPromise = Issuer.discover(issuerUrl).then(function (issuer) {
        return new issuer.Client({
          client_id: process.env.OIDC_CLIENT_ID,
          client_secret: process.env.OIDC_CLIENT_SECRET,
          redirect_uris: [redirectUri],
          response_types: ['code'],
        });
      });
      // une découverte échouée ne doit pas empoisonner les tentatives suivantes
      clientPromise.catch(function () { clientPromise = null; });
    }
    return clientPromise;
  }

  app.use(function (req, res, next) {
    req.fromLoggedInUser = function () {
      return !!(req.session && req.session[sessionKey]);
    };
    res.locals.loggedInUser = (req.session && req.session[sessionKey]) || null;
    res.locals.loginScriptUrl = loginjsPath;
    next();
  });

  app.get(loginjsPath, function (req, res) {
    res.type('.js');
    res.send([
      '(function () {',
      '  document.addEventListener("click", function (e) {',
      '    var loginEl = e.target.closest ? e.target.closest(' + JSON.stringify(loginSelector) + ') : null;',
      '    if (loginEl) {',
      '      e.preventDefault();',
      '      window.location = "/auth/login";',
      '      return;',
      '    }',
      '    var logoutEl = e.target.closest ? e.target.closest(' + JSON.stringify(logoutSelector) + ') : null;',
      '    if (logoutEl) {',
      '      e.preventDefault();',
      '      var xhr = new XMLHttpRequest();',
      '      xhr.open("POST", "/persona/logout");',
      '      xhr.onload = function () { window.location = "/"; };',
      '      xhr.send();',
      '    }',
      '  });',
      '})();',
    ].join('\n'));
  });

  app.get('/auth/login', function (req, res, next) {
    getClient().then(function (client) {
      var state = generators.state();
      var nonce = generators.nonce();
      var codeVerifier = generators.codeVerifier();
      var codeChallenge = generators.codeChallenge(codeVerifier);
      req.session.oidcState = state;
      req.session.oidcNonce = nonce;
      req.session.oidcCodeVerifier = codeVerifier;
      res.redirect(client.authorizationUrl({
        scope: 'openid email',
        state: state,
        nonce: nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }));
    }).catch(function (err) {
      console.error('[oidc-auth]', err);
      // Misconfiguration or a down IdP should surface, not be swallowed.
      return next(err);
    });
  });

  app.get('/auth/callback', extraMiddleware, function (req, res, next) {
    getClient().then(function (client) {
      var params = client.callbackParams(req);
      var checks = {
        state: req.session.oidcState,
        nonce: req.session.oidcNonce,
        code_verifier: req.session.oidcCodeVerifier,
      };
      return client.callback(redirectUri, params, checks).then(function (tokenSet) {
        var claims = tokenSet.claims();
        var verified = claims.email_verified;
        // Explicit allowlist: only an affirmatively-true claim (boolean or,
        // for IdPs/claim-mappers that stringify booleans, the string "true")
        // or an absent claim counts as verified. Absent-as-verified is a
        // deliberate policy here because we integrate with a single trusted
        // IdP that only ever asserts verified emails and simply omits the
        // claim rather than sending "email_verified": true. Anything else
        // (false, "false", or any other value) is rejected.
        var emailIsVerified = verified === true || verified === 'true' || verified === undefined;
        if (!claims.email || !emailIsVerified)
          return res.status(403).send('No verified email in OIDC claims');

        // Session fixation: drop everything the pre-auth session was
        // carrying (CSRF token, oidc state/nonce/verifier, any other
        // pre-login context) before establishing the authenticated
        // identity. state/nonce/verifier have already been checked above.
        req.session.reset();
        req.session[sessionKey] = claims.email;
        return res.redirect(303, redirects.notLoggedOut || '/');
      });
    }).catch(function (err) {
      console.error('[oidc-auth]', err);
      // Expired/replayed state, denied consent, back-button navigation, etc.
      // are routine and should return the user to the login page rather
      // than surface as a 500.
      return res.redirect(303, redirects.notLoggedIn || '/');
    });
  });

  app.post('/persona/logout', extraMiddleware, function (req, res) {
    req.session.reset();
    return res.json({status: 'okay'});
  });
};
