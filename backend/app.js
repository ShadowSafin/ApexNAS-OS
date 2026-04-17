const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const responseHelpers = require('./middleware/response');
const { requireAuth } = require('./middleware/auth');
const { publicLimiter, loginLimiter, writeLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./modules/auth/auth.routes');
const systemRoutes = require('./modules/system/system.routes');
const systemService = require('./modules/system/system.service');
const diskRoutes = require('./modules/disk/disk.routes');
const networkRoutes = require('./modules/network/network.routes');
const raidRoutes = require('./modules/raid/raid.routes');
const filesystemRoutes = require('./modules/storage/filesystem.routes');
const smbRoutes = require('./modules/smb/smb.routes');
const nfsRoutes = require('./modules/nfs/nfs.routes');
const ftpRoutes = require('./modules/ftp/ftp.routes');
const { FTPService } = require('./modules/ftp/ftp.service');
const userRoutes = require('./modules/users/users.routes');
const groupRoutes = require('./modules/users/groups.routes');
const aclRoutes = require('./modules/acl/acl.routes');
const shareRoutes = require('./modules/share/share.routes');
const { ShareService } = require('./modules/share/share.service');

function createApp() {
  const app = express();

  // Initialize services
  FTPService.init();
  ShareService.initialize();

  app.use(helmet());
  app.use(
    cors({
      origin: function (origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(responseHelpers);
  app.use(requestLogger);

  app.use('/api/auth', authRoutes);

  // Rate limit login endpoint
  app.post('/api/auth/login', loginLimiter);

  app.get('/api/system/health', publicLimiter, (req, res) => {
    res.ok(systemService.health());
  });

  app.get('/api/system/version', publicLimiter, (req, res) => {
    res.ok(systemService.version());
  });

  app.use(requireAuth);
  
  // Apply rate limiting to write operations
  app.post('*', writeLimiter);
  app.put('*', writeLimiter);
  app.delete('*', writeLimiter);
  
  app.use('/api/system', systemRoutes);
  app.use('/api/disk', diskRoutes);
  app.use('/api/network', networkRoutes);
  app.use('/api/raid', raidRoutes);
  app.use('/api/filesystem', filesystemRoutes);
  app.use('/api/smb', smbRoutes);
  app.use('/api/nfs', nfsRoutes);
  app.use('/api/ftp', ftpRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/acl', aclRoutes);
  app.use('/api/share', shareRoutes);

  app.use((req, res) => {
    res.status(404).fail('NOT_FOUND', 'Route not found');
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
