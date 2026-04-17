/**
 * Shared Constants
 * 
 * Centralized security constants used across modules:
 * - User/Group validation
 * - Path restrictions
 * - System blocklists
 */

const STORAGE_ROOT = '/mnt/storage';

// Paths that must NEVER be exposed or accessible
const BLOCKED_PATHS = [
  '/',
  '/etc',
  '/root',
  '/boot',
  '/dev',
  '/proc',
  '/sys',
  '/bin',
  '/sbin',
  '/usr',
  '/var',
  '/home',
  '/opt',
  '/tmp'
];

// Linux username validation: 1-32 chars, starts with letter, alphanumeric + underscore/hyphen/period
const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_.-]{0,31}$/;

// Linux group name validation: same rules as username
const GROUPNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_.-]{0,31}$/;

// System accounts that must NEVER be created, modified, or deleted
const SYSTEM_USERS = new Set([
  'root', 'admin', 'daemon', 'bin', 'sys', 'sync', 'games',
  'man', 'lp', 'mail', 'news', 'uucp', 'proxy', 'www-data',
  'backup', 'list', 'irc', 'gnats', 'nobody', 'systemd-network',
  'systemd-resolve', 'messagebus', 'syslog', 'nobody', 'ntp',
  'sshd', 'postfix', 'dovecot', 'mysql', 'postgres', 'redis',
  'ftp', 'ftpuser', 'samba', 'smbd', 'nmbd', 'nfsnobody',
  'tcpdump', 'avahi', 'colord', 'geoclue', 'pulse', 'rtkit',
  'snap_daemon', 'tss', 'usbmux', '_apt', 'statd'
]);

// System groups that must NEVER be deleted
const SYSTEM_GROUPS = new Set([
  'root', 'daemon', 'bin', 'sys', 'adm', 'tty', 'disk', 'lp',
  'mail', 'news', 'uucp', 'man', 'proxy', 'kmem', 'dialout',
  'fax', 'voice', 'cdrom', 'floppy', 'tape', 'sudo', 'audio',
  'dip', 'www-data', 'backup', 'operator', 'list', 'irc',
  'src', 'gnats', 'shadow', 'utmp', 'video', 'sasl', 'plugdev',
  'staff', 'games', 'users', 'nogroup', 'systemd-journal',
  'systemd-network', 'systemd-resolve', 'input', 'crontab',
  'syslog', 'messagebus', 'netdev', 'ssh', 'docker', 'sambashare'
]);

// Minimum UID/GID for non-system users (standard Linux convention)
const MIN_UID = 1000;
const MIN_GID = 1000;

module.exports = {
  STORAGE_ROOT,
  BLOCKED_PATHS,
  USERNAME_REGEX,
  GROUPNAME_REGEX,
  SYSTEM_USERS,
  SYSTEM_GROUPS,
  MIN_UID,
  MIN_GID
};
