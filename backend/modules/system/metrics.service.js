/**
 * Real-Time System Metrics Service
 *
 * Reads directly from Linux kernel interfaces and system binaries.
 * NO mock data. Every value is real.
 *
 * Data sources:
 *   CPU      → /proc/stat (delta method, 100ms sample)
 *   Memory   → /proc/meminfo
 *   Disk     → df -B1 (filtered to /mnt/storage)
 *   Network  → /proc/net/dev (delta for speed)
 *   Temp     → /sys/class/thermal/thermal_zone*
 *   System   → os module + /etc/os-release + /proc/uptime
 */

const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const logger = require('../../lib/logger');

// ── State for delta-based calculations ───────────────────────────────
let prevNetStats = null;
let prevNetTime = null;

// ── Metrics cache (1-second TTL) ─────────────────────────────────────
let metricsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 1500;

// ── Helpers ──────────────────────────────────────────────────────────

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function execPromise(cmd, args, timeout = 5000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout) => {
      if (err) {
        resolve('');
      } else {
        resolve(stdout.toString());
      }
    });
  });
}

// ── PART 1: CPU Usage (/proc/stat delta) ─────────────────────────────

function readCpuTimes() {
  const content = readFileSafe('/proc/stat');
  if (!content) return null;
  const line = content.split('\n').find(l => l.startsWith('cpu '));
  if (!line) return null;
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  // [user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice]
  const idle = (parts[3] || 0) + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

async function getCpuUsage() {
  try {
    const t1 = readCpuTimes();
    if (!t1) return 0;

    await new Promise(r => setTimeout(r, 100));

    const t2 = readCpuTimes();
    if (!t2) return 0;

    const idleDelta = t2.idle - t1.idle;
    const totalDelta = t2.total - t1.total;
    if (totalDelta <= 0) return 0;

    const usage = ((totalDelta - idleDelta) / totalDelta) * 100;
    return Math.min(100, Math.max(0, Math.round(usage)));
  } catch (err) {
    logger.warn('CPU usage read failed', { error: err.message });
    return 0;
  }
}

// ── PART 2: Memory Usage (/proc/meminfo) ────────────────────────────

function getMemoryUsage() {
  try {
    const content = readFileSafe('/proc/meminfo');
    if (!content) {
      return { total: 0, used: 0, available: 0, percent: 0 };
    }
    const mem = {};
    content.split('\n').forEach(line => {
      const parts = line.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const valKB = parseInt(parts[1].trim(), 10);
        if (!isNaN(valKB)) mem[key] = valKB * 1024; // KB → bytes
      }
    });

    const total = mem['MemTotal'] || 0;
    const available = mem['MemAvailable'] || mem['MemFree'] || 0;
    const used = total - available;
    const percent = total > 0 ? Math.round((used / total) * 100) : 0;

    return { total, used, available, percent };
  } catch (err) {
    logger.warn('Memory read failed', { error: err.message });
    return { total: 0, used: 0, available: 0, percent: 0 };
  }
}

// ── PART 3: Disk Usage (df, filtered to /mnt) ───────────────────────

async function getDiskUsage() {
  try {
    const output = await execPromise('df', ['-B1', '--output=source,size,used,avail,target']);
    if (!output) return { total: 0, used: 0, available: 0, percent: 0, mounts: [] };

    const lines = output.trim().split('\n').slice(1); // skip header
    const mounts = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const target = parts[4];
      // Include real block devices only, skip tmpfs/loop/udev
      if (parts[0].startsWith('/dev/') && !parts[0].includes('loop') && target !== '/dev') {
        mounts.push({
          source: parts[0],
          size: parseInt(parts[1], 10) || 0,
          used: parseInt(parts[2], 10) || 0,
          avail: parseInt(parts[3], 10) || 0,
          target
        });
      }
    }

    // Prefer /mnt/storage mounts; fallback to root filesystem
    let storageMounts = mounts.filter(m => m.target.startsWith('/mnt'));
    if (storageMounts.length === 0) {
      storageMounts = mounts.filter(m => m.target === '/');
    }
    if (storageMounts.length === 0 && mounts.length > 0) {
      storageMounts = [mounts[0]];
    }

    const total = storageMounts.reduce((s, m) => s + m.size, 0);
    const used = storageMounts.reduce((s, m) => s + m.used, 0);
    const available = storageMounts.reduce((s, m) => s + m.avail, 0);
    const percent = total > 0 ? Math.round((used / total) * 100) : 0;

    return { total, used, available, percent, mounts: storageMounts };
  } catch (err) {
    logger.warn('Disk usage read failed', { error: err.message });
    return { total: 0, used: 0, available: 0, percent: 0, mounts: [] };
  }
}

// ── PART 4: Network Statistics (/proc/net/dev) ──────────────────────

function getNetworkStats() {
  try {
    const content = readFileSafe('/proc/net/dev');
    if (!content) return { rx: 0, tx: 0, rxSpeed: 0, txSpeed: 0, interfaces: [] };

    const lines = content.split('\n').slice(2); // skip headers
    let totalRx = 0, totalTx = 0;
    const interfaces = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const name = parts[0].replace(':', '');
      if (name === 'lo') continue; // skip loopback

      const rx = parseInt(parts[1], 10) || 0;
      const tx = parseInt(parts[9], 10) || 0;
      totalRx += rx;
      totalTx += tx;
      interfaces.push({ name, rx, tx });
    }

    // Calculate speed from delta
    const now = Date.now();
    let rxSpeed = 0, txSpeed = 0;

    if (prevNetStats && prevNetTime) {
      const dt = (now - prevNetTime) / 1000; // seconds
      if (dt > 0) {
        rxSpeed = Math.max(0, Math.round((totalRx - prevNetStats.rx) / dt / 1024)); // KB/s
        txSpeed = Math.max(0, Math.round((totalTx - prevNetStats.tx) / dt / 1024)); // KB/s
      }
    }

    prevNetStats = { rx: totalRx, tx: totalTx };
    prevNetTime = now;

    return { rx: totalRx, tx: totalTx, rxSpeed, txSpeed, interfaces };
  } catch (err) {
    logger.warn('Network stats read failed', { error: err.message });
    return { rx: 0, tx: 0, rxSpeed: 0, txSpeed: 0, interfaces: [] };
  }
}

// ── PART 5 + 6: Temperature ─────────────────────────────────────────

function getCpuTemperature() {
  try {
    const thermalDir = '/sys/class/thermal';
    if (!fs.existsSync(thermalDir)) return 0;

    const zones = fs.readdirSync(thermalDir).filter(d => d.startsWith('thermal_zone'));

    // Try to find a zone with type containing 'x86' or 'cpu' or 'package'
    for (const zone of zones) {
      try {
        const type = readFileSafe(`${thermalDir}/${zone}/type`).trim().toLowerCase();
        if (type.includes('x86') || type.includes('cpu') || type.includes('package') || type.includes('core')) {
          const raw = parseInt(readFileSafe(`${thermalDir}/${zone}/temp`).trim(), 10);
          if (!isNaN(raw) && raw > 0) return Math.round(raw / 1000);
        }
      } catch { /* skip zone */ }
    }

    // Fallback: read zone0
    const raw = parseInt(readFileSafe(`${thermalDir}/thermal_zone0/temp`).trim(), 10);
    if (!isNaN(raw) && raw > 0) return Math.round(raw / 1000);

    return 0;
  } catch {
    return 0;
  }
}

async function getDiskTemperature() {
  try {
    const output = await execPromise('smartctl', ['-A', '/dev/sda'], 5000);
    if (!output) return 0;
    const match = output.match(/Temperature_Celsius.*?(\d+)/);
    if (match && match[1]) return parseInt(match[1], 10);
    // Try nvme format
    const match2 = output.match(/Temperature:\s+(\d+)/);
    if (match2 && match2[1]) return parseInt(match2[1], 10);
    return 0;
  } catch {
    return 0;
  }
}

async function getTemperature() {
  const [cpuTemp, diskTemp] = await Promise.all([
    Promise.resolve(getCpuTemperature()),
    getDiskTemperature()
  ]);
  return { cpuTemp, diskTemp };
}

// ── PART 7: System Information ──────────────────────────────────────

function getSystemInfo() {
  // Hostname
  const hostname = os.hostname();

  // OS name from /etc/os-release
  let osName = os.type();
  try {
    const osRelease = readFileSafe('/etc/os-release');
    const match = osRelease.match(/PRETTY_NAME="([^"]+)"/);
    if (match) osName = match[1];
  } catch { /* fallback to os.type() */ }

  // Kernel
  const kernel = os.release();

  // Uptime from /proc/uptime (more accurate)
  let uptime = os.uptime();
  try {
    const raw = readFileSafe('/proc/uptime').trim();
    const secs = parseFloat(raw.split(' ')[0]);
    if (!isNaN(secs)) uptime = Math.round(secs);
  } catch { /* fallback */ }

  // Format uptime
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const uptimeFormatted = days > 0
    ? `${days}d ${hours}h ${mins}m`
    : hours > 0
      ? `${hours}h ${mins}m`
      : `${mins}m`;

  // Load average
  const load = os.loadavg();
  const loadFormatted = `${load[0].toFixed(2)}, ${load[1].toFixed(2)}, ${load[2].toFixed(2)}`;

  // Processor
  const cpus = os.cpus();
  const processor = cpus.length > 0 ? `${cpus[0].model} (${cpus.length} cores)` : 'Unknown';

  return {
    hostname,
    os: osName,
    kernel,
    uptime: uptimeFormatted,
    uptimeSeconds: uptime,
    loadAverage: loadFormatted,
    loadValues: { '1m': load[0], '5m': load[1], '15m': load[2] },
    processor,
    cpuCount: cpus.length
  };
}

// ── PART 8: Unified Metrics Endpoint ────────────────────────────────

async function getMetrics() {
  const now = Date.now();
  if (metricsCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return metricsCache;
  }

  // CPU needs its own await (100ms sample), run it first
  // Then batch the rest in parallel
  const cpuUsage = await getCpuUsage();

  const [memory, disk, temperature] = await Promise.all([
    Promise.resolve(getMemoryUsage()),
    getDiskUsage(),
    getTemperature()
  ]);

  const network = getNetworkStats();
  const system = getSystemInfo();

  const result = {
    cpu: { usage: cpuUsage },
    memory,
    disk,
    network,
    temperature,
    system,
    timestamp: new Date().toISOString()
  };

  metricsCache = result;
  cacheTimestamp = now;

  return result;
}

module.exports = { getMetrics };
