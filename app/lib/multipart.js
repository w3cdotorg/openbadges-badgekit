const formidable = require('formidable');

// Express 4 dropped the multipart support that Express 3's bodyParser had;
// this restores the old req.body / req.files shape the views rely on
// (file.path and file.type, single file per field)
module.exports = function multipart () {
  return function (req, res, next) {
    const contentType = req.headers['content-type'] || '';
    if (contentType.indexOf('multipart/form-data') === -1)
      return next();

    const form = formidable({multiples: false});
    form.parse(req, function (err, fields, files) {
      if (err)
        return next(err);

      req.body = req.body || {};
      Object.keys(fields).forEach(function (key) {
        req.body[key] = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
      });

      req.files = {};
      Object.keys(files).forEach(function (key) {
        const file = Array.isArray(files[key]) ? files[key][0] : files[key];
        if (!file || !file.size)
          return;
        req.files[key] = {
          path: file.filepath,
          name: file.originalFilename,
          type: file.mimetype,
          size: file.size,
        };
      });

      return next();
    });
  };
};
