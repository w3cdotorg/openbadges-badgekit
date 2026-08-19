function defaultCsrfValue (req) {
  return (req.body && req.body._csrf) || (req.query && req.query._csrf) || (req.headers['x-csrf-token']);
}

function whitelisted (list, input) {
  var pattern;

  for (var i = list.length; i--;) {
    pattern = list[i];
    if (RegExp('^' + list[i] + '$').test(input))
      return true;
  }

  return false;
}

var crypto = require('crypto');

// CSRF tokens only need to be compared for equality (see `val != token`
// below), so a plain hex string from a CSPRNG is sufficient — no need to
// preserve the old alphanumeric alphabet. `len` here is the number of random
// bytes, matching the previous call site's `uid(24)`.
function uid (len) {
  return crypto.randomBytes(len).toString('hex');
}

exports = module.exports = function (options) {
  options = options || {};
  var value = options.value || defaultCsrfValue;
  var list = options.whitelist || [];

  return function (req, res, next) {
    if (whitelisted(list, req.url))
      return next();

    var token = req.session._csrf || (req.session._csrf = uid(24));

    if ('GET' === req.method || 'HEAD' === req.method)
      return next();

    var val = value(req);
    if (val != token) {
      // logger.debug("CSRF token failure");
      return next(new Error('Forbidden - expecting "'+token+'", got "'+val+'"'));
    }

    next();
  };
};
