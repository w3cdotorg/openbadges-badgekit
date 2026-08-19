const methods = ['get', 'post', 'put', 'delete', 'del', 'patch', 'all'];

// Express 4 replacement for express-monkey-patch (which subclassed the
// Express 3 Router and relied on its internals): supports the
// app.VERB(path, name, ...handlers) signature and reverse routing through
// res.locals.url(name, params)
module.exports = function namedRoutes (app) {
  const lookup = {};

  app.use(function (req, res, next) {
    res.locals.url = function url (name, params) {
      if (!lookup.hasOwnProperty(name))
        throw new Error('Route named "' + name + '" not found');
      return resolve(lookup[name], params);
    };
    next();
  });

  app.mountPoint = '';

  methods.forEach(function (method) {
    const target = method === 'del' ? 'delete' : method;
    const original = app[target].bind(app);

    app[method] = function (path) {
      // app.get('setting name') is Express's settings getter
      if (method === 'get' && arguments.length === 1)
        return original(path);

      var handlers = Array.prototype.slice.call(arguments, 1);
      if (typeof handlers[0] === 'string')
        lookup[handlers.shift()] = path;

      return original.apply(null, [path].concat(handlers));
    };
  });

  return app;
};

function resolve (routePath, params) {
  if (params == null)
    params = {};

  return routePath.replace(/:([A-Za-z0-9_]+)\??/g, function (match, key) {
    if (!(key in params))
      throw new Error('Missing value for route parameter `' + key + '` in path ' + routePath);
    return encodeURIComponent(params[key]);
  });
}
