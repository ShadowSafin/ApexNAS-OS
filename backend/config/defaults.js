module.exports = {
  port: 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
  accessTokenTtl: '15m',
  refreshTokenTtl: '7d',
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || './logs',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) : ['http://localhost:3000', 'http://localhost:5173'],
  dataDir: process.env.DATA_DIR || './data',
  pluginsDir: process.env.PLUGINS_DIR || '../plugins',
  allowedCommands: new Set([
    'lsblk', 'blkid', 'parted', 'mkfs.ext4', 'mkfs.xfs', 'mkfs.btrfs', 'mkfs.jfs',
    'mount', 'umount', 'mdadm', 'smartctl', 'df', 'free', 'uname', 'hostname', 'ip',
    'samba', 'nmbd', 'smbd', 'nfs', 'vsftpd', 'rsync', 'btrfs', 'docker', 'systemctl',
    'journalctl', 'shutdown', 'id', 'getent', 'useradd', 'usermod', 'userdel', 'groupadd',
    'groupmod', 'groupdel', 'setfacl', 'getfacl', 'uptime', 'cat', 'ls', 'du',
    'smbpasswd', 'passwd', 'chpasswd', 'gpasswd'
  ])
};
