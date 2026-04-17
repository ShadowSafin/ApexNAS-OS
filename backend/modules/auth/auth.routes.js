const express = require('express');
const { validate } = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const authService = require('./auth.service');
const { loginSchema, refreshSchema } = require('./auth.schema');

const router = express.Router();

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    res.ok({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
  } catch (err) {
    res.status(401).fail('UNAUTHORIZED', 'Invalid username or password');
  }
});

router.post('/refresh', validate(refreshSchema), (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const accessToken = authService.refresh(refreshToken);
    res.ok({ accessToken });
  } catch (err) {
    res.status(401).fail('UNAUTHORIZED', err.message);
  }
});

router.post('/logout', validate(refreshSchema), (req, res, next) => {
  const { refreshToken } = req.body;
  authService.logout(refreshToken);
  res.ok({ message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  const user = req.user;
  res.ok({ id: user.id, username: user.username, role: user.role });
});

module.exports = router;
