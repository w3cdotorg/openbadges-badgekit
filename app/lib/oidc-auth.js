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
  var extraMiddleware = config.middleware || function (req, res, next) { next(); };
  redirects = config.redirects || {};

  var issuerUrl = process.env.OIDC_ISSUER;
  var redirectUri = process.env.OIDC_REDIRECT_URI;

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
    res.locals.loginScriptUrl = '/persona/login.js';
    next();
  });

  app.get('/persona/login.js', function (req, res) {
    res.type('.js');
    res.send([
      '(function () {',
      '  document.addEventListener("click", function (e) {',
      '    if (e.target.closest(' + JSON.stringify(loginSelector) + ')) {',
      '      e.preventDefault();',
      '      window.location = "/auth/login";',
      '      return;',
      '    }',
      '    if (e.target.closest(' + JSON.stringify(logoutSelector) + ')) {',
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
      req.session.oidcState = state;
      req.session.oidcNonce = nonce;
      res.redirect(client.authorizationUrl({
        scope: 'openid email',
        state: state,
        nonce: nonce,
      }));
    }).catch(next);
  });

  app.get('/auth/callback', extraMiddleware, function (req, res, next) {
    getClient().then(function (client) {
      var params = client.callbackParams(req);
      var checks = { state: req.session.oidcState, nonce: req.session.oidcNonce };
      delete req.session.oidcState;
      delete req.session.oidcNonce;
      return client.callback(redirectUri, params, checks).then(function (tokenSet) {
        var claims = tokenSet.claims();
        if (!claims.email || claims.email_verified === false)
          return res.status(403).send('No verified email in OIDC claims');
        req.session[sessionKey] = claims.email;
        return res.redirect(303, redirects.notLoggedOut || '/');
      });
    }).catch(next);
  });

  app.post('/persona/logout', extraMiddleware, function (req, res) {
    req.session[sessionKey] = null;
    return res.json({status: 'okay'});
  });
};
