const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).fail('UNAUTHORIZED', 'Missing Authorization header');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
    return next();
  } catch (err) {
    return res.status(401).fail('UNAUTHORIZED', 'Invalid or expired token');
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).fail('FORBIDDEN', 'Insufficient role permissions');
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
