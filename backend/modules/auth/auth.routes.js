const express = require('express');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { validate } = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const authService = require('./auth.service');
const { loginSchema, refreshSchema, changePasswordSchema, changeUsernameSchema } = require('./auth.schema');
const config = require('../../config');
const logger = require('../../lib/logger');
const path = require('path');

const router = express.Router();

const authFile = '/etc/apexnas/auth.json';
const defaultPasswordHash = '$2a$10$wNXBnNbPBsr.Tc4BGRGW/e5qfwx9aEyPO7k4sB1dpbA/b9WzHu6QC';

function loadAuth() {
  try {
    if (!fs.existsSync(authFile)) {
      const dir = path.dirname(authFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      }
      const defaultAuth = { username: 'admin', passwordHash: defaultPasswordHash };
      fs.writeFileSync(authFile, JSON.stringify(defaultAuth, null, 2), 'utf-8');
      return defaultAuth;
    }
    return JSON.parse(fs.readFileSync(authFile, 'utf-8'));
  } catch {
    const defaultAuth = { username: 'admin', passwordHash: defaultPasswordHash };
    return defaultAuth;
  }
}

function saveAuth(auth) {
  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(authFile, JSON.stringify(auth, null, 2), 'utf-8');
}

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const auth = loadAuth();
    
    if (username !== auth.username) {
      res.status(401).fail('UNAUTHORIZED', 'Invalid username or password');
      return;
    }

    const isValid = await bcrypt.compare(password, auth.passwordHash);
    if (!isValid) {
      res.status(401).fail('UNAUTHORIZED', 'Invalid username or password');
      return;
    }

    const user = { id: 'apexnas-user', username: auth.username, role: 'admin' };
    const accessToken = authService.signAccessToken(user);
    const refreshToken = authService.signRefreshToken(user);

    res.ok({ accessToken, refreshToken, user });
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

router.post('/change-password', requireAuth, validate(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const auth = loadAuth();

    const isValid = await bcrypt.compare(currentPassword, auth.passwordHash);
    if (!isValid) {
      res.status(401).fail('UNAUTHORIZED', 'Current password is incorrect');
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    auth.passwordHash = newHash;
    saveAuth(auth);

    logger.info('Password changed successfully');
    res.ok({ message: 'Password changed successfully' });
  } catch (err) {
    logger.error('Change password error', { error: err.message });
    res.status(500).fail('INTERNAL_ERROR', 'Failed to change password');
  }
});

router.post('/change-username', requireAuth, validate(changeUsernameSchema), async (req, res) => {
  try {
    const { newUsername, password } = req.body;
    const auth = loadAuth();

    const isValid = await bcrypt.compare(password, auth.passwordHash);
    if (!isValid) {
      res.status(401).fail('UNAUTHORIZED', 'Password is incorrect');
      return;
    }

    auth.username = newUsername;
    saveAuth(auth);

    logger.info('Username changed', { oldUsername: req.user.username, newUsername });
    res.ok({ message: 'Username changed successfully' });
  } catch (err) {
    logger.error('Change username error', { error: err.message });
    res.status(500).fail('INTERNAL_ERROR', 'Failed to change username');
  }
});

module.exports = router;
