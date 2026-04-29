const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const logger = require('../../lib/logger');

const usersFile = path.join(config.dataDir, 'users.json');
const blacklistedRefreshTokens = new Set();

function loadUsers() {
  if (!fs.existsSync(usersFile)) {
    return [];
  }
  const raw = fs.readFileSync(usersFile, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    logger.error('Failed to parse users.json', { message: err.message });
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf-8');
}

async function verifyUser(username, password) {
  const users = loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  user.lastLogin = new Date().toISOString();
  saveUsers(users);

  return { id: user.id, username: user.username, role: user.role };
}

function signAccessToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, config.jwtSecret, {
    expiresIn: config.accessTokenTtl
  });
}

function signRefreshToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, config.jwtRefreshSecret, {
    expiresIn: config.refreshTokenTtl
  });
}

function login(username, password) {
  return verifyUser(username, password).then((user) => {
    if (!user) {
      throw new Error('Invalid credentials');
    }
    return {
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
      user
    };
  });
}

function refresh(refreshToken) {
  if (blacklistedRefreshTokens.has(refreshToken)) {
    throw new Error('Refresh token is revoked');
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret);
  } catch (err) {
    throw new Error('Invalid refresh token');
  }

  const user = { id: payload.id, username: payload.username, role: payload.role };
  return signAccessToken(user);
}

function logout(refreshToken) {
  if (refreshToken) {
    blacklistedRefreshTokens.add(refreshToken);
  }
}

function getUserFromToken(accessToken) {
  const payload = jwt.verify(accessToken, config.jwtSecret);
  return { id: payload.id, username: payload.username, role: payload.role };
}

module.exports = {
  verifyUser,
  login,
  refresh,
  logout,
  getUserFromToken,
  loadUsers,
  saveUsers,
  signAccessToken,
  signRefreshToken
};
