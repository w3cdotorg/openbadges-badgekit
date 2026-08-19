// Drop-in replacement for express-persona-observer: the Mozilla Persona
// service this app authenticated against was shut down in November 2016,
// so real assertions can no longer be verified. This module keeps the same
// interface (express(), ensureLoggedIn(), ensureLoggedOut(),
// req.fromLoggedInUser()) but replaces the Persona flow with a plain
// email prompt. Development only — there is NO identity verification.

var redirects = {};

exports.ensureLoggedIn = function ensureLoggedIn (path) {
  return function (req, res, next) {
    var redirectPath = path || redirects.notLoggedIn;
    if (!req.fromLoggedInUser()) {
      if (redirectPath)
        return res.redirect(303, redirectPath);
      return next('Not logged in');
    }
    return next();
  };
};

exports.ensureLoggedOut = function ensureLoggedOut (path) {
  return function (req, res, next) {
    var redirectPath = path || redirects.notLoggedOut;
    if (req.fromLoggedInUser()) {
      if (redirectPath)
        return res.redirect(303, redirectPath);
      return next('Logged in');
    }
    return next();
  };
};

exports.express = function (app, config) {
  config = config || {};
  var logoutPath = config.logoutPath || '/persona/logout';
  var verifyPath = config.verifyPath || '/persona/verify';
  var loginjsPath = config.loginjsPath || '/persona/login.js';
  var sessionKey = config.sessionKey || 'email';
  var selectors = config.selectors || {};
  var loginSelector = selectors.login || '#login';
  var logoutSelector = selectors.logout || '#logout';
  var extraMiddleware = config.middleware || function (req, res, next) { next(); };

  redirects = config.redirects || {};

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
    res.send(loginScript({
      loginSelector: loginSelector,
      logoutSelector: logoutSelector,
      verifyPath: verifyPath,
      logoutPath: logoutPath,
    }));
  });

  app.post(verifyPath, extraMiddleware, function (req, res) {
    var email = req.body && req.body.email;
    if (!email || !/^[^@\s]+@[^@\s]+$/.test(email))
      return res.status(400).json({status: 'failure', reason: 'invalid email'});
    req.session[sessionKey] = email;
    return res.json({status: 'okay', email: email});
  });

  app.post(logoutPath, extraMiddleware, function (req, res) {
    req.session[sessionKey] = null;
    return res.json({status: 'okay'});
  });
};

function loginScript (opts) {
  return [
    '(function () {',
    '  var loginSelector = ' + JSON.stringify(opts.loginSelector) + ';',
    '  var logoutSelector = ' + JSON.stringify(opts.logoutSelector) + ';',
    '  function post(url, data) {',
    '    var xhr = new XMLHttpRequest();',
    '    xhr.open("POST", url);',
    '    xhr.setRequestHeader("Content-Type", "application/json");',
    '    xhr.onload = function () { window.location.reload(); };',
    '    xhr.send(JSON.stringify(data || {}));',
    '  }',
    '  document.addEventListener("click", function (e) {',
    '    var el = e.target.closest ? e.target.closest(loginSelector) : null;',
    '    if (el) {',
    '      e.preventDefault();',
    '      var email = window.prompt("Dev login (Persona is gone) - email address:");',
    '      if (email) post(' + JSON.stringify(opts.verifyPath) + ', {email: email});',
    '      return;',
    '    }',
    '    el = e.target.closest ? e.target.closest(logoutSelector) : null;',
    '    if (el) {',
    '      e.preventDefault();',
    '      post(' + JSON.stringify(opts.logoutPath) + ');',
    '    }',
    '  });',
    '})();',
  ].join('\n');
}
