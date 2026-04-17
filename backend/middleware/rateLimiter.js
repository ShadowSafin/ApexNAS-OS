/**
 * Rate Limiting Middleware
 * Implements simple in-memory rate limiting per IP address
 * 
 * For production, consider using:
 * - express-rate-limit with Redis store
 * - nginx rate limiting
 * - CloudFlare rate limiting
 */

// Store for request tracking
// Format: { "ip:endpoint": [timestamp1, timestamp2, ...] }
const requestStore = {};
const CLEANUP_INTERVAL = 60000; // Clean up every minute

// Cleanup old entries to prevent memory issues
setInterval(() => {
  const now = Date.now();
  const maxAge = 60000; // Keep 1 minute of history
  
  for (const key in requestStore) {
    requestStore[key] = requestStore[key].filter(ts => now - ts < maxAge);
    if (requestStore[key].length === 0) {
      delete requestStore[key];
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Generic rate limiter factory
 * @param {number} maxRequests - Maximum requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @param {string} message - Error message
 * @returns {Function} Express middleware
 */
function createRateLimiter(maxRequests, windowMs, message = 'Too many requests') {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const key = `${ip}:${req.path || 'global'}`;
    
    if (!requestStore[key]) {
      requestStore[key] = [];
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    // Remove old requests outside the window
    requestStore[key] = requestStore[key].filter(ts => ts > windowStart);

    if (requestStore[key].length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfter: Math.ceil((requestStore[key][0] + windowMs - now) / 1000)
      });
    }

    requestStore[key].push(now);
    
    // Add rate limit info to response headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - requestStore[key].length);
    res.setHeader('X-RateLimit-Reset', new Date(requestStore[key][0] + windowMs).toISOString());

    next();
  };
}

/**
 * Different rate limiters for different endpoint categories
 */

// Public endpoints (no auth) - stricter limits
const publicLimiter = createRateLimiter(
  20,      // 20 requests
  60000,   // per minute
  'Too many public requests. Please try again later.'
);

// Authenticated endpoints - more generous
const authLimiter = createRateLimiter(
  100,     // 100 requests
  60000,   // per minute
  'Too many requests. Please try again later.'
);

// Destructive operations (POST, PUT, DELETE) - strict
const writeLimiter = createRateLimiter(
  10,      // 10 write operations
  60000,   // per minute
  'Too many write operations. Please try again later.'
);

// Login endpoint - very strict
const loginLimiter = createRateLimiter(
  5,       // 5 attempts
  300000,  // per 5 minutes
  'Too many login attempts. Please try again in 5 minutes.'
);

module.exports = {
  createRateLimiter,
  publicLimiter,
  authLimiter,
  writeLimiter,
  loginLimiter
};
