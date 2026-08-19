const path = require('path');
const sass = require('sass');
const tabzilla = require('mozilla-tabzilla');

// Compiles <root>/scss/<name>.scss on requests for <prefix>/css/<name>.css.
// Replaces the node-sass middleware from 2014 (node-sass no longer builds
// on current Node; dart-sass is its maintained successor).
// tabzilla exports includePaths as a single string
const loadPaths = [].concat(tabzilla.includePaths || []);

module.exports = function sassMiddleware (root, prefix) {
  const cssPrefix = prefix + '/css/';
  const cache = {};

  return function (req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return next();
    if (req.path.indexOf(cssPrefix) !== 0 || req.path.slice(-4) !== '.css')
      return next();

    const rel = req.path.slice(cssPrefix.length, -4);
    if (rel.indexOf('..') !== -1)
      return next();

    if (cache[rel])
      return res.type('css').send(cache[rel]);

    const file = path.join(root, 'scss', rel + '.scss');
    var result;
    try {
      result = sass.compile(file, {
        loadPaths: loadPaths,
        quietDeps: true,
        logger: { warn: function () {}, debug: function () {} },
      });
    } catch (err) {
      if (/no such file|Can't find stylesheet/i.test(err.message || ''))
        return next();
      return next(err);
    }

    cache[rel] = result.css;
    return res.type('css').send(result.css);
  };
};
