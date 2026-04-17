const { ZodError } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    try {
      let validated;
      
      // Try to directly validate req.body first (for modern schemas like FTP, auth)
      try {
        validated = schema.parse(req.body);
      } catch (directErr) {
        // If direct parsing fails, try wrapping with 'body' (for legacy schemas like apps)
        if (directErr instanceof ZodError) {
          try {
            const result = schema.parse({ body: req.body });
            // Extract body from result if it exists
            validated = result.body || result;
          } catch {
            // Direct error is more relevant, throw that
            throw directErr;
          }
        } else {
          throw directErr;
        }
      }
      
      req.body = validated;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        console.error('Validation error:', err.errors);
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          issues: err.errors
        });
      }
      next(err);
    }
  };
}

module.exports = { validate };
