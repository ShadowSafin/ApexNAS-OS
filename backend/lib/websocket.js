const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('./logger');

let wss;
const clients = new Set();

function setupWebSocket(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    ws.isAuthorized = false;
    ws.user = null;

    clients.add(ws);
    logger.info('websocket connection established');

    const authTimer = setTimeout(() => {
      if (!ws.isAuthorized) {
        logger.warn('websocket auth timeout, closing connection');
        ws.close(4001, 'Authentication timeout');
      }
    }, 10000);

    ws.on('message', (raw) => {
      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch (err) {
        logger.warn('websocket invalid JSON, closing', { error: err.message });
        return ws.close(4002, 'Invalid JSON');
      }

      if (!ws.isAuthorized) {
        if (payload && payload.type === 'auth' && payload.token) {
          try {
            const decoded = jwt.verify(payload.token, config.jwtSecret);
            ws.isAuthorized = true;
            ws.user = { id: decoded.id, username: decoded.username, role: decoded.role };
            ws.send(JSON.stringify({ event: 'welcome', data: { message: 'authenticated' }, timestamp: new Date().toISOString() }));
            logger.info('websocket client authenticated', { user: ws.user });
            clearTimeout(authTimer);
          } catch (err) {
            logger.warn('websocket auth failure', { reason: err.message });
            return ws.close(4003, 'Unauthorized');
          }
        } else {
          logger.warn('websocket unauthenticated attempt before auth');
          return ws.close(4004, 'Authentication required');
        }
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.info('websocket connection closed');
      clearTimeout(authTimer);
    });

    ws.on('error', (err) => {
      logger.error('websocket error', { error: err.message });
    });
  });

  const keepAlive = setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(keepAlive);
  });
}

function sendTo(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(event, data) {
  const payload = { event, data, timestamp: new Date().toISOString() };
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      sendTo(ws, payload);
    }
  }
}

function broadcastToRole(event, data, role) {
  const payload = { event, data, timestamp: new Date().toISOString() };
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN && ws.isAuthorized && ws.user && ws.user.role === role) {
      sendTo(ws, payload);
    }
  }
}

module.exports = {
  setupWebSocket,
  broadcast,
  broadcastToRole,
  clients
};
