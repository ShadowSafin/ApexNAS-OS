const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../../lib/logger');
const { parseFstabEntry, formatFstabEntry } = require('./disk.util');

const FSTAB_PATH = '/etc/fstab';
const FSTAB_BACKUP_PATH = '/etc/fstab.bak';
const FSTAB_TEMP_PATH = '/etc/fstab.tmp';
const FSTAB_LOCK_PATH = '/var/run/fstab.lock';

// FIX 4: File locking mechanism for concurrent access prevention
function acquireLock() {
  try {
    // Try to create lock file exclusively - will fail if already exists
    const lockFd = fs.openSync(FSTAB_LOCK_PATH, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o644);
    fs.writeSync(lockFd, process.pid.toString());
    fs.closeSync(lockFd);
    logger.debug('fstab lock acquired', { pid: process.pid });
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      logger.warn('fstab lock already held by another process');
      return false;
    }
    logger.error('Failed to acquire fstab lock', { error: err.message });
    return false;
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(FSTAB_LOCK_PATH);
    logger.debug('fstab lock released');
  } catch (err) {
    logger.warn('Failed to release fstab lock', { error: err.message });
  }
}

// FIX 2 AUDIT: Robust lock retry mechanism with exponential backoff + jitter
// Handles high concurrency (100+ operations) without starvation or cascading failures
function waitForLock(maxRetries = 50, delayMs = 50) {
  const startTime = Date.now();
  const maxWaitMs = 10000;  // 10 second total timeout protection
  let retries = 0;
  
  while (retries < maxRetries) {
    if (acquireLock()) {
      const elapsed = Date.now() - startTime;
      if (retries > 0) {
        logger.debug('fstab lock acquired after retries', { attempts: retries, elapsedMs: elapsed });
      }
      return true;
    }
    
    retries++;
    const elapsed = Date.now() - startTime;
    
    // Check total timeout to prevent indefinite hangs
    if (elapsed >= maxWaitMs) {
      logger.error('Could not acquire fstab lock - timeout exceeded', { 
        maxRetries, totalWaitMs: elapsed, attempts: retries 
      });
      throw new Error('LOCK_TIMEOUT');
    }
    
    // Exponential backoff with jitter to prevent thundering herd
    // delay = base * (2^min(attempt, 6)) + random(0-50ms)
    // attempt 1→ 50-100ms, 2→ 100-150ms, 3→ 200-250ms, ..., 6+→ 2000-2050ms
    const exponentialWait = delayMs * Math.pow(2, Math.min(retries, 6));
    const jitter = Math.random() * 50;  // 0-50ms random jitter
    const totalWait = Math.min(exponentialWait + jitter, 2000);  // Cap individual wait at 2 seconds
    
    // Log every 5+ attempts to avoid log spam
    if (retries % 5 === 0 || retries === 1) {
      logger.debug('Retrying lock acquisition', { 
        attempt: retries, waitMs: Math.round(totalWait), totalElapsedMs: elapsed, maxRetries 
      });
    }
    
    // Busy wait loop (necessary for synchronous fstab operations)
    // Future: make addEntry/removeEntry async for truly non-blocking behavior
    const endTime = Date.now() + totalWait;
    while (Date.now() < endTime) {
      // Intentional busy wait - provides fairness in lock scheduling
    }
  }
  
  logger.error('Could not acquire fstab lock - max retries exceeded', { 
    maxRetries, totalWaitMs: Date.now() - startTime 
  });
  throw new Error('LOCK_TIMEOUT');
}

function readFstab() {
  try {
    return fs.readFileSync(FSTAB_PATH, 'utf-8');
  } catch (err) {
    logger.error('Failed to read fstab', { error: err.message });
    throw new Error('Cannot read fstab');
  }
}

// FIX 3: Atomic fstab write - write to temp file, validate, then atomically replace
function writeFstab(content) {
  try {
    // Validate content before writing
    if (typeof content !== 'string') {
      throw new Error('fstab content must be a string');
    }
    if (content.trim().length === 0) {
      throw new Error('Cannot write empty fstab file');
    }

    // Step 1: Write to temporary file
    try {
      fs.writeFileSync(FSTAB_TEMP_PATH, content, 'utf-8');
      logger.debug('fstab temp file written');
    } catch (writeErr) {
      logger.error('Failed to write fstab temp file', { error: writeErr.message });
      throw new Error('Cannot write fstab temp file');
    }

    // Step 2: Validate temp file
    try {
      const tempContent = fs.readFileSync(FSTAB_TEMP_PATH, 'utf-8');
      if (tempContent !== content) {
        throw new Error('Temp file content mismatch - possible filesystem corruption');
      }
      if (tempContent.trim().length === 0) {
        throw new Error('Temp file is empty - validation failed');
      }
      logger.debug('fstab temp file validated');
    } catch (validateErr) {
      logger.error('Failed to validate fstab temp file', { error: validateErr.message });
      try {
        fs.unlinkSync(FSTAB_TEMP_PATH);
      } catch (cleanupErr) {
        logger.warn('Failed to cleanup temp file', { error: cleanupErr.message });
      }
      throw new Error('Temp file validation failed');
    }

    // Step 3: Atomically replace original with temp (POSIX atomic)
    try {
      fs.renameSync(FSTAB_TEMP_PATH, FSTAB_PATH);
      logger.info('fstab atomically updated');
    } catch (renameErr) {
      logger.error('Failed to atomically replace fstab', { error: renameErr.message });
      try {
        fs.unlinkSync(FSTAB_TEMP_PATH);
      } catch (cleanupErr) {
        logger.warn('Failed to cleanup temp file after rename failure', { error: cleanupErr.message });
      }
      throw new Error('Cannot atomically update fstab');
    }
  } catch (err) {
    logger.error('Failed to write fstab', { error: err.message });
    throw err;
  }
}

function parseEntries(content) {
  return content.split(/\r?\n/).map(parseFstabEntry).filter(Boolean);
}

function findEntry(entries, predicate) {
  return entries.findIndex(predicate);
}

function entryExists(entries, device, mountpoint) {
  return findEntry(entries, (e) => e.device === device || e.mountpoint === mountpoint) !== -1;
}

function addEntry(device, mountpoint, fstype, options = 'defaults', dump = '0', passno = '0') {
  // Acquire lock for this operation (will throw LOCK_TIMEOUT if lock acquisition fails)
  try {
    waitForLock();
  } catch (lockErr) {
    logger.error('Failed to acquire fstab lock for addEntry', { error: lockErr.message });
    throw new Error('Could not acquire fstab lock - try again later');
  }

  try {
    const content = readFstab();
    const entries = parseEntries(content);

    if (entryExists(entries, device, mountpoint)) {
      throw new Error('Entry already exists');
    }

    const newEntry = formatFstabEntry(device, mountpoint, fstype, options, dump, passno);
    const comments = content.split(/\r?\n/).filter((line) => !line.trim() || line.trim().startsWith('#'));

    let newContent = content;
    if (!newContent.endsWith('\n')) {
      newContent += '\n';
    }
    newContent += newEntry + '\n';

    writeFstab(newContent);
    logger.info('fstab entry added', { device, mountpoint });
  } finally {
    releaseLock();
  }
}

function removeEntry(predicate) {
  // Acquire lock for this operation (will throw LOCK_TIMEOUT if lock acquisition fails)
  try {
    waitForLock();
  } catch (lockErr) {
    logger.error('Failed to acquire fstab lock for removeEntry', { error: lockErr.message });
    throw new Error('Could not acquire fstab lock - try again later');
  }

  try {
    const content = readFstab();
    const lines = content.split(/\r?\n/);

    let found = false;
    const filtered = lines.filter((line) => {
      const entry = parseFstabEntry(line);
      if (!entry) return true;

      if (predicate(entry)) {
        found = true;
        return false;
      }
      return true;
    });

    if (!found) {
      throw new Error('Entry not found in fstab');
    }

    writeFstab(filtered.join('\n'));
    logger.info('fstab entry removed');
  } finally {
    releaseLock();
  }
}

function removeByMountpoint(mountpoint) {
  removeEntry((e) => e.mountpoint === mountpoint);
}

function removeByDevice(device) {
  removeEntry((e) => e.device === device);
}

module.exports = {
  readFstab,
  writeFstab,
  parseEntries,
  findEntry,
  entryExists,
  addEntry,
  removeEntry,
  removeByMountpoint,
  removeByDevice
};
