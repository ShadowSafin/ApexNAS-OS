const http = require('http');
const config = require('./config');
const { createApp } = require('./app');
const { setupWebSocket } = require('./lib/websocket');
const logger = require('./lib/logger');

const app = createApp();
const server = http.createServer(app);

setupWebSocket(server);

server.listen(config.port, () => {
  logger.info(`ApexNAS backend listening on port ${config.port}`);
});

function shutdown(signal) {
  const start = Date.now();
  logger.info(`Received ${signal}, shutting down...`);

  server.close((err) => {
    const duration = Date.now() - start;
    if (err) {
      logger.error('Error closing server', { error: err.message });
      process.exit(1);
    }
    logger.info(`Shutdown complete in ${duration}ms`);
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn('Forcing shutdown due to timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
