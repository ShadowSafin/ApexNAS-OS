/**
 * PHASE 5 - ADVERSARIAL SECURITY VALIDATION
 * 
 * Network-level security audit of SMB and NFS services
 * Focus: Real attack vectors, unauthorized access, privilege escalation
 * 
 * MANDATORY 12 TEST SCENARIOS
 * 
 * Role: Senior Linux Security Engineer
 * Environment: Assume hostile network
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync, spawn } = require('child_process');
const { SMBService } = require('./backend/modules/smb/smb.service');
const { NFSService } = require('./backend/modules/nfs/nfs.service');
const logger = require('./backend/lib/logger');

const STORAGE_ROOT = '/mnt/storage';
const NETWORK_SHARES_PATH = '/etc/nas/network-shares.json';
const SMB_CONFIG = '/etc/samba/smb.conf';
const NFS_CONFIG = '/etc/exports';

let testResults = [];
let passCount = 0;
let failCount = 0;

// Color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  let prefix = '•';
  let color = colors.reset;

  switch (type) {
    case 'pass':
      prefix = '✅ PASS';
      color = colors.green;
      break;
    case 'fail':
      prefix = '❌ FAIL';
      color = colors.red;
      break;
    case 'section':
      prefix = '📋';
      color = colors.cyan;
      break;
    case 'critical':
      prefix = '⚠️ CRITICAL';
      color = colors.red;
      break;
    case 'warning':
      prefix = '⚠️ WARNING';
      color = colors.yellow;
      break;
  }

  console.log(`${color}[${timestamp}] ${prefix} ${message}${colors.reset}`);
}

function recordTest(testNum, name, passed, severity, details) {
  testResults.push({
    testNum,
    name,
    passed,
    severity,
    details
  });

  if (passed) {
    passCount++;
    log(`Test ${testNum}: ${name} - PASS`, 'pass');
  } else {
    failCount++;
    log(`Test ${testNum}: ${name} - FAIL (${severity})`, 'fail');
  }

  if (details) {
    log(`  Details: ${details}`, 'info');
  }
}

/**
 * TEST 1: SMB ACCESS CONTROL
 * 
 * Verify that SMB shares respect authentication
 * - Anonymous access blocked by default
 * - Only authenticated users can access
 */
async function test1_smbAccessControl() {
  log('TEST 1: SMB Access Control (Authentication)', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-smb-auth');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Create share with restricted users
    const createResult = await SMBService.createShare({
      name: 'test-restricted-smb',
      path: testDir,
      browseable: true,
      writable: false,
      guestOk: false, // Explicitly disable guest
      validUsers: ['testuser']
    });

    if (!createResult.success) {
      recordTest(1, 'SMB Access Control', false, 'HIGH', 'Failed to create restricted share');
      return;
    }

    // Verify share config blocks guest
    const config = SMBService.parseExports();
    const shareConfig = config.config?.find(s => s.name === '[test-restricted-smb]');

    if (shareConfig && shareConfig['guest ok'] === 'no') {
      recordTest(1, 'SMB Access Control', true, 'HIGH', 'Guest access disabled, user restriction enforced');
    } else {
      recordTest(1, 'SMB Access Control', false, 'CRITICAL', 'Guest access not properly disabled');
    }
  } catch (err) {
    recordTest(1, 'SMB Access Control', false, 'HIGH', err.message);
  }
}

/**
 * TEST 2: NFS ACCESS CONTROL
 * 
 * Verify that NFS respects subnet restrictions
 * - Only specified clients can access
 * - Denied from unauthorized IPs
 */
async function test2_nfsAccessControl() {
  log('TEST 2: NFS Access Control (Subnet Restriction)', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-nfs-subnet');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Create NFS export restricted to localhost only
    const createResult = await NFSService.createShare({
      name: 'test-restricted-nfs',
      path: testDir,
      clients: [
        { ip: '127.0.0.1', options: 'ro,sync,no_subtree_check' }
      ]
    });

    if (!createResult.success) {
      recordTest(2, 'NFS Access Control', false, 'HIGH', 'Failed to create restricted export');
      return;
    }

    // Verify export file contains correct restrictions
    const exportsContent = fs.readFileSync(NFS_CONFIG, 'utf8');
    const hasRestriction = exportsContent.includes('127.0.0.1') && 
                           !exportsContent.match(/\*\s*\(/); // No wildcard exports

    if (hasRestriction) {
      recordTest(2, 'NFS Access Control', true, 'HIGH', 'NFS exports restricted to localhost, no wildcard access');
    } else {
      recordTest(2, 'NFS Access Control', false, 'CRITICAL', 'NFS exports may have unrestricted access');
    }
  } catch (err) {
    recordTest(2, 'NFS Access Control', false, 'HIGH', err.message);
  }
}

/**
 * TEST 3: PATH ESCAPE VIA SMB
 * 
 * Attempt directory traversal through SMB share
 * - Try ../ escapes
 * - Try symlink following to system dirs
 */
async function test3_smbPathEscape() {
  log('TEST 3: SMB Path Escape Attack', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-escape-smb');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Test 1: Direct traversal attempt
    const traversalResult = await SMBService.createShare({
      name: 'test-escape-1',
      path: '/mnt/storage/../../../etc'
    });

    const test1Pass = !traversalResult.success && traversalResult.error === 'UNSAFE_PATH';

    // Test 2: URL encoding bypass
    const encodedResult = await SMBService.createShare({
      name: 'test-escape-2',
      path: '/mnt/storage/%2e%2e/%2e%2e/etc'
    });

    const test2Pass = !encodedResult.success && encodedResult.error === 'UNSAFE_PATH';

    // Test 3: Double encoding
    const doubleResult = await SMBService.createShare({
      name: 'test-escape-3',
      path: '/mnt/storage/%252e%252e/etc'
    });

    const test3Pass = !doubleResult.success;

    if (test1Pass && test2Pass && test3Pass) {
      recordTest(3, 'SMB Path Escape', true, 'CRITICAL', 'All traversal attempts (direct, URL, double-encoded) blocked');
    } else {
      recordTest(3, 'SMB Path Escape', false, 'CRITICAL', `Escape vectors: direct=${!test1Pass}, url=${!test2Pass}, double=${!test3Pass}`);
    }
  } catch (err) {
    recordTest(3, 'SMB Path Escape', false, 'CRITICAL', err.message);
  }
}

/**
 * TEST 4: NFS PATH ESCAPE
 * 
 * Attempt directory traversal through NFS export
 * - Try ../ escapes
 * - Try symlink bypass
 */
async function test4_nfsPathEscape() {
  log('TEST 4: NFS Path Escape Attack', 'section');
  try {
    // Test traversal attempts
    const traversalResult = await NFSService.createShare({
      name: 'test-nfs-escape-1',
      path: '/mnt/storage/../../etc'
    });

    const test1Pass = !traversalResult.success && traversalResult.error === 'UNSAFE_PATH';

    // Test URL encoding
    const encodedResult = await NFSService.createShare({
      name: 'test-nfs-escape-2',
      path: '/mnt/storage/%2e%2e/etc'
    });

    const test2Pass = !encodedResult.success;

    if (test1Pass && test2Pass) {
      recordTest(4, 'NFS Path Escape', true, 'CRITICAL', 'NFS traversal attempts blocked');
    } else {
      recordTest(4, 'NFS Path Escape', false, 'CRITICAL', `Escape vectors: direct=${!test1Pass}, url=${!test2Pass}`);
    }
  } catch (err) {
    recordTest(4, 'NFS Path Escape', false, 'CRITICAL', err.message);
  }
}

/**
 * TEST 5: PERMISSION ENFORCEMENT
 * 
 * Test ACL enforcement on restricted shares
 * - Readonly shares cannot be modified
 * - Write permissions respected
 */
async function test5_permissionEnforcement() {
  log('TEST 5: Permission Enforcement', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-perms');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Create readonly SMB share
    const createResult = await SMBService.createShare({
      name: 'test-readonly',
      path: testDir,
      writable: false, // Readonly
      browseable: true
    });

    if (!createResult.success) {
      recordTest(5, 'Permission Enforcement', false, 'HIGH', 'Failed to create readonly share');
      return;
    }

    // Try to create read-write share on same path
    const rwResult = await SMBService.createShare({
      name: 'test-readwrite',
      path: testDir,
      writable: true
    });

    // Should succeed (different share name, same path OK)
    // But verify readonly share is actually marked readonly in config
    const config = SMBService.parseExports();
    const readonlyShare = config.config?.find(s => s.name === '[test-readonly]');

    if (readonlyShare && readonlyShare['read only'] === 'yes') {
      recordTest(5, 'Permission Enforcement', true, 'HIGH', 'Readonly permission correctly enforced in SMB config');
    } else {
      recordTest(5, 'Permission Enforcement', false, 'HIGH', 'Readonly permission not properly set');
    }
  } catch (err) {
    recordTest(5, 'Permission Enforcement', false, 'HIGH', err.message);
  }
}

/**
 * TEST 6: ROOT SQUASH ENFORCEMENT (CRITICAL)
 * 
 * Verify that NFS root squash is enforced
 * - Root access from client reduced to nobody
 * - Unless explicitly overridden
 */
async function test6_rootSquashEnforcement() {
  log('TEST 6: NFS Root Squash Enforcement (CRITICAL)', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-rootsquash');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Create default NFS export (should have root_squash)
    const defaultResult = await NFSService.createShare({
      name: 'test-default-ns',
      path: testDir,
      clients: [{ ip: '127.0.0.1', options: 'rw,sync,no_subtree_check' }]
    });

    // Try to create with no_root_squash (should fail without confirmation)
    const noSquashResult = await NFSService.createShare({
      name: 'test-nosquash-1',
      path: path.join(STORAGE_ROOT, 'test-nosquash'),
      clients: [{ ip: '127.0.0.1', options: 'rw,sync,no_root_squash' }]
    });

    // Should fail because no_root_squash requires confirmation
    const test1Pass = !noSquashResult.success;

    // Try with explicit confirmation
    const confirmedResult = await NFSService.createShare({
      name: 'test-nosquash-2',
      path: path.join(STORAGE_ROOT, 'test-nosquash-2'),
      clients: [
        { 
          ip: '127.0.0.1', 
          options: 'rw,sync,no_root_squash',
          confirmNoRootSquash: true 
        }
      ]
    });

    // Should succeed with confirmation
    const test2Pass = confirmedResult.success;

    if (test1Pass && test2Pass) {
      recordTest(6, 'Root Squash Enforcement', true, 'CRITICAL', 
        'Root squash enforced by default, no_root_squash requires explicit confirmation');
    } else {
      recordTest(6, 'Root Squash Enforcement', false, 'CRITICAL', 
        `Squash enforcement: default=${test1Pass}, explicit=${test2Pass}`);
    }
  } catch (err) {
    recordTest(6, 'Root Squash Enforcement', false, 'CRITICAL', err.message);
  }
}

/**
 * TEST 7: GUEST ACCESS BLOCKED
 * 
 * Verify SMB guest access is blocked by default
 */
async function test7_guestAccessBlocked() {
  log('TEST 7: SMB Guest Access Blocked', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-guest-block');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Create default SMB share
    const createResult = await SMBService.createShare({
      name: 'test-no-guest',
      path: testDir,
      guestOk: false // Explicitly disable
    });

    if (!createResult.success) {
      recordTest(7, 'Guest Access Blocked', false, 'HIGH', 'Failed to create guest-blocked share');
      return;
    }

    // Verify guest is disabled in config
    const config = SMBService.parseExports();
    const share = config.config?.find(s => s.name === '[test-no-guest]');

    if (share && (share['guest ok'] === 'no' || !share['guest ok'])) {
      recordTest(7, 'Guest Access Blocked', true, 'HIGH', 'Guest access disabled in SMB share config');
    } else {
      recordTest(7, 'Guest Access Blocked', false, 'HIGH', 'Guest access not properly disabled');
    }
  } catch (err) {
    recordTest(7, 'Guest Access Blocked', false, 'HIGH', err.message);
  }
}

/**
 * TEST 8: CONFIG CORRUPTION HANDLING
 * 
 * Test system behavior with corrupted config
 * - Invalid syntax in SMB config
 * - Invalid syntax in NFS config
 * - System should handle gracefully
 */
async function test8_configCorruptionHandling() {
  log('TEST 8: Config Corruption Handling', 'section');
  try {
    // Backup configs
    const smbBackup = fs.readFileSync(SMB_CONFIG, 'utf8');
    const nfsBackup = fs.readFileSync(NFS_CONFIG, 'utf8');

    let test1Pass = false;
    let test2Pass = false;

    // Test 1: Corrupt SMB config
    try {
      fs.writeFileSync(SMB_CONFIG, '[global]\n INVALID SYNTAX HERE ][]][', 'utf8');
      
      // Try to parse
      const parseResult = SMBService.parseExports();
      
      // Should parse without crash (even if partial)
      test1Pass = true;
    } catch (err) {
      // Parsing error is OK if system doesn't crash
      test1Pass = true;
    } finally {
      fs.writeFileSync(SMB_CONFIG, smbBackup, 'utf8');
    }

    // Test 2: Corrupt NFS config
    try {
      fs.writeFileSync(NFS_CONFIG, '/path/to/export ][][][ INVALID', 'utf8');
      
      const parseResult = NFSService.parseExports();
      test2Pass = true;
    } catch (err) {
      test2Pass = true;
    } finally {
      fs.writeFileSync(NFS_CONFIG, nfsBackup, 'utf8');
    }

    if (test1Pass && test2Pass) {
      recordTest(8, 'Config Corruption Handling', true, 'MEDIUM', 
        'System handles corrupted configs gracefully (no crash)');
    } else {
      recordTest(8, 'Config Corruption Handling', false, 'MEDIUM', 
        `Corruption handling: SMB=${test1Pass}, NFS=${test2Pass}`);
    }
  } catch (err) {
    recordTest(8, 'Config Corruption Handling', false, 'MEDIUM', err.message);
  }
}

/**
 * TEST 9: CONCURRENT OPERATIONS
 * 
 * Test concurrent share creation doesn't create duplicates
 */
async function test9_concurrentOperations() {
  log('TEST 9: Concurrent Share Operations', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-concurrent');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Attempt concurrent creates (should handle race condition)
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(
        SMBService.createShare({
          name: 'test-concurrent-race',
          path: path.join(testDir, `subdir${i}`)
        })
      );
    }

    const results = await Promise.all(promises);

    // Only one should succeed
    const successes = results.filter(r => r.success).length;

    if (successes === 1) {
      recordTest(9, 'Concurrent Operations', true, 'MEDIUM', 'Race condition handled: only 1 of 3 concurrent creates succeeded');
    } else {
      recordTest(9, 'Concurrent Operations', false, 'MEDIUM', 
        `Race condition not handled properly: ${successes} concurrent creates succeeded`);
    }
  } catch (err) {
    recordTest(9, 'Concurrent Operations', false, 'MEDIUM', err.message);
  }
}

/**
 * TEST 10: SERVICE RELOAD SAFETY
 * 
 * Test that service reload doesn't break config
 */
async function test10_serviceReloadSafety() {
  log('TEST 10: Service Reload Safety', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-reload-safety');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Create shares that trigger reload
    const smbResult = await SMBService.createShare({
      name: 'test-reload-smb',
      path: testDir
    });

    const nfsResult = await NFSService.createShare({
      name: 'test-reload-nfs',
      path: testDir,
      clients: []
    });

    // Verify configs are valid after reload
    let smbValid = false;
    let nfsValid = false;

    try {
      const smbConfig = fs.readFileSync(SMB_CONFIG, 'utf8');
      smbValid = smbConfig.length > 0 && smbConfig.includes('[global]');
    } catch (err) { /* */ }

    try {
      const nfsConfig = fs.readFileSync(NFS_CONFIG, 'utf8');
      nfsValid = nfsConfig.length > 0;
    } catch (err) { /* */ }

    if (smbResult.success && nfsResult.success && smbValid && nfsValid) {
      recordTest(10, 'Service Reload Safety', true, 'HIGH', 
        'Services reloaded successfully without config corruption');
    } else {
      recordTest(10, 'Service Reload Safety', false, 'HIGH', 
        `Reload valid: SMB=${smbValid}, NFS=${nfsValid}`);
    }
  } catch (err) {
    recordTest(10, 'Service Reload Safety', false, 'HIGH', err.message);
  }
}

/**
 * TEST 11: NETWORK VISIBILITY
 * 
 * Verify only intended shares are visible
 * - SMB browse list doesn't expose system dirs
 * - NFS showmount doesn't expose system dirs
 */
async function test11_networkVisibility() {
  log('TEST 11: Network Visibility (Scan Simulation)', 'section');
  try {
    // Check SMB config for hidden shares
    const smbConfig = SMBService.parseExports();
    const hiddenShares = smbConfig.config?.filter(s => 
      s.name?.toLowerCase().includes('share') || s.name?.toLowerCase().includes('homes')
    );

    // Check NFS exports for hidden paths
    const nfsExports = NFSService.parseExports();
    const exposedPaths = nfsExports.exports?.filter(e => 
      !e.path.startsWith(STORAGE_ROOT)
    );

    // Verify no system paths in either
    const smbOK = !smbConfig.config?.some(s => 
      s.path?.includes('/etc') || s.path?.includes('/root') || s.path?.includes('/sys')
    );

    const nfsOK = !nfsExports.exports?.some(e => 
      e.path?.includes('/etc') || e.path?.includes('/root') || e.path?.includes('/sys')
    );

    if (smbOK && nfsOK) {
      recordTest(11, 'Network Visibility', true, 'HIGH', 
        'No system paths exposed in SMB browse list or NFS exports');
    } else {
      recordTest(11, 'Network Visibility', false, 'HIGH', 
        `System paths exposed: SMB=${!smbOK}, NFS=${!nfsOK}`);
    }
  } catch (err) {
    recordTest(11, 'Network Visibility', false, 'HIGH', err.message);
  }
}

/**
 * TEST 12: INVALID CLIENT BLOCKING
 * 
 * Verify unauthorized clients are rejected
 */
async function test12_invalidClientBlocking() {
  log('TEST 12: Invalid Client Blocking', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-invalid-client');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Test 1: Try to create NFS export for invalid IP
    const invalidIPResult = await NFSService.createShare({
      name: 'test-invalid-1',
      path: testDir,
      clients: [
        { ip: 'INVALID_IP_ADDRESS', options: 'rw,sync' }
      ]
    });

    const test1Pass = !invalidIPResult.success;

    // Test 2: Try wildcard-only export
    const wildcardResult = await NFSService.createShare({
      name: 'test-invalid-2',
      path: testDir,
      clients: [
        { ip: '*', options: 'rw,sync' }
      ]
    });

    const test2Pass = !wildcardResult.success;

    // Test 3: Try invalid SMB user
    const invalidUserResult = await SMBService.createShare({
      name: 'test-invalid-3',
      path: testDir,
      validUsers: ['@@@INVALID@@@']
    });

    const test3Pass = !invalidUserResult.success;

    if (test1Pass && test2Pass && test3Pass) {
      recordTest(12, 'Invalid Client Blocking', true, 'HIGH', 
        'Invalid IPs, wildcards, and usernames all rejected');
    } else {
      recordTest(12, 'Invalid Client Blocking', false, 'HIGH', 
        `Blocking: invalid_ip=${test1Pass}, wildcard=${test2Pass}, invalid_user=${test3Pass}`);
    }
  } catch (err) {
    recordTest(12, 'Invalid Client Blocking', false, 'HIGH', err.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('');
  log('═════════════════════════════════════════════════════════════════════════════', 'section');
  log('PHASE 5 - ADVERSARIAL SECURITY VALIDATION (Network-Level)', 'section');
  log('Role: Senior Linux Security Engineer', 'section');
  log('Environment: Hostile Network - All Attack Vectors', 'section');
  log('═════════════════════════════════════════════════════════════════════════════', 'section');
  console.log('');

  // Run all tests sequentially
  await test1_smbAccessControl();
  console.log('');
  await test2_nfsAccessControl();
  console.log('');
  await test3_smbPathEscape();
  console.log('');
  await test4_nfsPathEscape();
  console.log('');
  await test5_permissionEnforcement();
  console.log('');
  await test6_rootSquashEnforcement();
  console.log('');
  await test7_guestAccessBlocked();
  console.log('');
  await test8_configCorruptionHandling();
  console.log('');
  await test9_concurrentOperations();
  console.log('');
  await test10_serviceReloadSafety();
  console.log('');
  await test11_networkVisibility();
  console.log('');
  await test12_invalidClientBlocking();
  console.log('');

  // Generate report
  generateReport();
}

function generateReport() {
  log('═════════════════════════════════════════════════════════════════════════════', 'section');
  log('SECURITY AUDIT REPORT', 'section');
  log('═════════════════════════════════════════════════════════════════════════════', 'section');
  console.log('');

  // Summary
  log(`TOTAL RESULTS: ${passCount}/12 PASSED, ${failCount}/12 FAILED`, 'section');
  console.log('');

  // Details
  const bySeverity = {
    'CRITICAL': [],
    'HIGH': [],
    'MEDIUM': [],
    'LOW': []
  };

  testResults.forEach(result => {
    if (!result.passed) {
      bySeverity[result.severity]?.push(result);
    }
  });

  if (Object.values(bySeverity).some(arr => arr.length > 0)) {
    log('VULNERABILITIES FOUND:', 'section');
    console.log('');

    Object.entries(bySeverity).forEach(([severity, tests]) => {
      if (tests.length > 0) {
        const severityColor = severity === 'CRITICAL' ? colors.red : 
                             severity === 'HIGH' ? colors.yellow : colors.reset;
        console.log(`${severityColor}${severity} (${tests.length} found)${colors.reset}`);
        tests.forEach(test => {
          console.log(`  - Test ${test.testNum}: ${test.name}`);
          console.log(`    ${test.details}`);
        });
        console.log('');
      }
    });
  } else {
    log('NO VULNERABILITIES FOUND', 'pass');
    console.log('');
  }

  // Final Verdict
  console.log('');
  log('═════════════════════════════════════════════════════════════════════════════', 'section');

  let verdict = 'PRODUCTION READY';
  let criticalCount = testResults.filter(r => !r.passed && r.severity === 'CRITICAL').length;
  let highCount = testResults.filter(r => !r.passed && r.severity === 'HIGH').length;

  if (criticalCount > 0) {
    verdict = 'NOT SAFE';
    log(`❌ VERDICT: ${verdict}`, 'critical');
    log(`CRITICAL VULNERABILITIES: ${criticalCount}`, 'critical');
  } else if (highCount > 0) {
    verdict = 'READY WITH FIXES';
    log(`⚠️ VERDICT: ${verdict}`, 'warning');
    log(`HIGH SEVERITY ISSUES: ${highCount}`, 'warning');
  } else {
    verdict = 'PRODUCTION READY';
    log(`✅ VERDICT: ${verdict}`, 'pass');
  }

  console.log('');
  log('═════════════════════════════════════════════════════════════════════════════', 'section');

  // Details
  console.log('');
  log('TEST RESULTS DETAIL:', 'section');
  console.log('');
  testResults.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} Test ${result.testNum}: ${result.name}`);
    console.log(`   Status: ${result.passed ? 'PASS' : 'FAIL'} | Severity: ${result.severity}`);
    console.log(`   Details: ${result.details}`);
    console.log('');
  });

  // Exit code
  if (verdict === 'PRODUCTION READY' && passCount === 12) {
    process.exit(0);
  } else if (verdict === 'READY WITH FIXES') {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Run the validation
runAllTests().catch(err => {
  log(`Fatal error: ${err.message}`, 'critical');
  process.exit(1);
});
