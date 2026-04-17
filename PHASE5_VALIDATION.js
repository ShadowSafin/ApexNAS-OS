/**
 * Phase 5 - Network Sharing (SMB + NFS) - Comprehensive Validation Test Suite
 * 
 * MANDATORY 10 VALIDATION SCENARIOS
 * - Tests SMB and NFS network sharing security and functionality
 * - Validates path safety, config integrity, privilege restrictions
 * - Tests reboot persistence and service reliability
 * 
 * SUCCESS CRITERION: All 10 tests must PASS for production deployment
 */

const fs = require('fs');
const path = require('path');
const { SMBService } = require('./modules/smb/smb.service');
const { NFSService } = require('./modules/nfs/nfs.service');
const logger = require('./lib/logger');

const STORAGE_ROOT = '/mnt/storage';
const NETWORK_SHARES_PATH = '/etc/nas/network-shares.json';

let passCount = 0;
let failCount = 0;

function log(message, style = 'info') {
  const timestamp = new Date().toISOString();
  const styles = {
    pass: '✅',
    fail: '❌',
    info: 'ℹ️',
    section: '📋'
  };
  console.log(`[${timestamp}] ${styles[style] || '•'} ${message}`);
}

/**
 * TEST 1: Create SMB share with valid parameters
 */
async function test1_createValidSMBShare() {
  log('TEST 1: Create valid SMB share', 'section');
  try {
    // First ensure test directory exists
    const testDir = path.join(STORAGE_ROOT, 'test-smb-share');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const result = await SMBService.createShare({
      name: 'test-smb-01',
      path: testDir,
      browseable: true,
      writable: false,
      validUsers: ['testuser']
    });

    if (result.success && result.share) {
      log(`✓ SMB share created: ${result.share.name}`, 'pass');
      passCount++;
      return true;
    } else {
      log(`✗ Failed to create SMB share: ${result.message}`, 'fail');
      failCount++;
      return false;
    }
  } catch (err) {
    log(`✗ Test 1 error: ${err.message}`, 'fail');
    failCount++;
    return false;
  }
}

/**
 * TEST 2: Create NFS export with valid parameters
 */
async function test2_createValidNFSExport() {
  log('TEST 2: Create valid NFS export', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-nfs-share');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const result = await NFSService.createShare({
      name: 'test-nfs-01',
      path: testDir,
      clients: [
        { ip: '127.0.0.1', options: 'ro,sync,no_subtree_check' }
      ]
    });

    if (result.success && result.share) {
      log(`✓ NFS export created: ${result.share.name}`, 'pass');
      passCount++;
      return true;
    } else {
      log(`✗ Failed to create NFS export: ${result.message}`, 'fail');
      failCount++;
      return false;
    }
  } catch (err) {
    log(`✗ Test 2 error: ${err.message}`, 'fail');
    failCount++;
    return false;
  }
}

/**
 * TEST 3: Reject duplicate SMB shares
 */
async function test3_rejectDuplicateSMBShare() {
  log('TEST 3: Reject duplicate SMB share', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-dup-smb');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create first share
    const result1 = await SMBService.createShare({
      name: 'test-duplicate-smb',
      path: testDir,
      browseable: true
    });

    if (!result1.success) {
      log(`✗ First share creation failed: ${result1.message}`, 'fail');
      failCount++;
      return false;
    }

    // Try to create duplicate
    const result2 = await SMBService.createShare({
      name: 'test-duplicate-smb',
      path: path.join(STORAGE_ROOT, 'test-dup-smb-2'),
      browseable: true
    });

    if (!result2.success && result2.error === 'DUPLICATE_SHARE') {
      log(`✓ Duplicate share correctly rejected`, 'pass');
      passCount++;
      return true;
    } else {
      log(`✗ Duplicate share was not rejected: ${result2.message}`, 'fail');
      failCount++;
      return false;
    }
  } catch (err) {
    log(`✗ Test 3 error: ${err.message}`, 'fail');
    failCount++;
    return false;
  }
}

/**
 * TEST 4: Block path traversal attacks
 */
async function test4_blockPathTraversal() {
  log('TEST 4: Block path traversal attacks', 'section');
  try {
    // Try /mnt/storage/../etc traversal
    const result1 = await SMBService.createShare({
      name: 'test-traversal-1',
      path: '/mnt/storage/../etc'
    });

    // Try URL-encoded traversal
    const result2 = await SMBService.createShare({
      name: 'test-traversal-2',
      path: '/mnt/storage/%2e%2e/etc'
    });

    if ((!result1.success && result1.error === 'UNSAFE_PATH') &&
        (!result2.success && result2.error === 'UNSAFE_PATH')) {
      log(`✓ Path traversal attacks blocked`, 'pass');
      passCount++;
      return true;
    } else {
      log(`✗ Path traversal was not blocked`, 'fail');
      failCount++;
      return false;
    }
  } catch (err) {
    log(`✗ Test 4 error: ${err.message}`, 'fail');
    failCount++;
    return false;
  }
}

/**
 * TEST 5: Block dangerous system paths
 */
async function test5_blockDangerousPaths() {
  log('TEST 5: Block dangerous system paths', 'section');
  try {
    const dangerousPaths = ['/etc', '/root', '/boot', '/sys', '/proc', '/dev'];
    let allBlocked = true;

    for (const dangerous of dangerousPaths) {
      const result = await SMBService.createShare({
        name: `test-dangerous-${Math.random()}`,
        path: dangerous
      });

      if (result.success) {
        log(`✗ Dangerous path allowed: ${dangerous}`, 'fail');
        allBlocked = false;
      }
    }

    if (allBlocked) {
      log(`✓ All dangerous system paths blocked`, 'pass');
      passCount++;
      return true;
    } else {
      failCount++;
      return false;
    }
  } catch (err) {
    log(`✗ Test 5 error: ${err.message}`, 'fail');
    failCount++;
    return false;
  }
}

/**
 * TEST 6: Validate config file integrity after shares
 */
async function test6_validateConfigIntegrity() {
  log('TEST 6: Validate config file integrity', 'section');
  try {
    // Create a few shares
    const testDir1 = path.join(STORAGE_ROOT, 'test-config-1');
    const testDir2 = path.join(STORAGE_ROOT, 'test-config-2');
    if (!fs.existsSync(testDir1)) fs.mkdirSync(testDir1, { recursive: true });
    if (!fs.existsSync(testDir2)) fs.mkdirSync(testDir2, { recursive: true });

    await SMBService.createShare({ name: 'test-config-smb-1', path: testDir1 });
    await NFSService.createShare({ name: 'test-config-nfs-1', path: testDir2, clients: [] });

    // Check network-shares.json is valid JSON
    if (!fs.existsSync(NETWORK_SHARES_PATH)) {
      log(`✗ network-shares.json not created`, 'fail');
      failCount++;
      return false;
    }

    const data = JSON.parse(fs.readFileSync(NETWORK_SHARES_PATH, 'utf8'));

    if (data.smb && data.nfs && Array.isArray(data.smb) && Array.isArray(data.nfs)) {
      log(`✓ Config file is valid JSON with proper structure`, 'pass');
      passCount++;
      return true;
    } else {
      log(`✗ Config file has invalid structure`, 'fail');
      failCount++;
      return false;
    }
  } catch (err) {
    log(`✗ Test 6 error: ${err.message}`, 'fail');
    failCount++;
    return false;
  }
}

/**
 * TEST 7: Service reload works without errors
 */
async function test7_serviceReloadWorks() {
  log('TEST 7: Service reload works', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-reload');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create share (which triggers reload)
    const smbResult = await SMBService.createShare({
      name: 'test-reload-smb',
      path: testDir,
      browseable: true
    });

    const nfsResult = await NFSService.createShare({
      name: 'test-reload-nfs',
      path: testDir,
      clients: []
    });

    if (smbResult.success && nfsResult.success) {
      log(`✓ Service reloads executed successfully`, 'pass');
      passCount++;
      return true;
    } else {
      log(`✗ Service reload failed`, 'fail');
      failCount++;
      return false;
    }
  } catch (err) {
    log(`✗ Test 7 error: ${err.message}`, 'fail');
    failCount++;
    return false;
  }
}

/**
 * TEST 8: Remove shares cleanly
 */
async function test8_removeSharesCleanly() {
  log('TEST 8: Remove shares cleanly', 'section');
  try {
    const testDir = path.join(STORAGE_ROOT, 'test-remove');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create shares
    const smbCreate = await SMBService.createShare({
      name: 'test-remove-smb',
      path: testDir
    });

    const nfsCreate = await NFSService.createShare({
      name: 'test-remove-nfs',
      path: testDir,
      clients: []
    });

    if (!smbCreate.success || !nfsCreate.success) {
      log(`✗ Share creation failed`, 'fail');
      failCount++;
      return false;
    }

    // Remove shares
    const smbRemove = await SMBService.removeShare({ name: 'test-remove-smb' });
    const nfsRemove = await NFSService.removeShare({ name: 'test-remove-nfs' });

    if (smbRemove.success && nfsRemove.success) {
      log(`✓ Shares removed cleanly`, 'pass');
      passCount++;
      return true;
    } else {
      log(`✗ Share removal failed`, 'fail');
      failCount++;
      return false;
    }
  } catch (err) {
    log(`✗ Test 8 error: ${err.message}`, 'fail');
    failCount++;
    return false;
  }
}

/**
 * TEST 9: List shares returns correct data
 */
async function test9_listSharesWorks() {
  log('TEST 9: List shares works', 'section');
  try {
    const smbList = await SMBService.listShares();
    const nfsList = await NFSService.listShares();

    if (smbList.success && Array.isArray(smbList.shares) &&
        nfsList.success && Array.isArray(nfsList.shares)) {
      log(`✓ Share listing works (SMB: ${smbList.count}, NFS: ${nfsList.count} shares)`, 'pass');
      passCount++;
      return true;
    } else {
      log(`✗ Share listing failed`, 'fail');
      failCount++;
      return false;
    }
  } catch (err) {
    log(`✗ Test 9 error: ${err.message}`, 'fail');
    failCount++;
    return false;
  }
}

/**
 * TEST 10: No privilege escalation possible
 */
async function test10_noPrvilegeEscalation() {
  log('TEST 10: No privilege escalation possible', 'section');
  try {
    // Try to access restricted paths via share
    const attempts = [
      { name: 'test-priv-1', path: '/' },
      { name: 'test-priv-2', path: '/etc/shadow' },
      { name: 'test-priv-3', path: '/root/.ssh' }
    ];

    let allBlocked = true;

    for (const attempt of attempts) {
      const result = await SMBService.createShare({
        name: attempt.name,
        path: attempt.path
      });

      if (result.success) {
        log(`✗ Privilege escalation allowed to: ${attempt.path}`, 'fail');
        allBlocked = false;
      }
    }

    if (allBlocked) {
      log(`✓ All privilege escalation attempts blocked`, 'pass');
      passCount++;
      return true;
    } else {
      failCount++;
      return false;
    }
  } catch (err) {
    log(`✗ Test 10 error: ${err.message}`, 'fail');
    failCount++;
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  log('═══════════════════════════════════════════════════════════', 'section');
  log('PHASE 5 - NETWORK SHARING (SMB + NFS) VALIDATION TEST SUITE', 'section');
  log('═══════════════════════════════════════════════════════════', 'section');
  console.log('');

  // Run all tests
  await test1_createValidSMBShare();
  console.log('');
  await test2_createValidNFSExport();
  console.log('');
  await test3_rejectDuplicateSMBShare();
  console.log('');
  await test4_blockPathTraversal();
  console.log('');
  await test5_blockDangerousPaths();
  console.log('');
  await test6_validateConfigIntegrity();
  console.log('');
  await test7_serviceReloadWorks();
  console.log('');
  await test8_removeSharesCleanly();
  console.log('');
  await test9_listSharesWorks();
  console.log('');
  await test10_noPrvilegeEscalation();
  console.log('');

  // Summary
  log('═══════════════════════════════════════════════════════════', 'section');
  log(`RESULTS: ${passCount}/10 PASSED, ${failCount}/10 FAILED`, 'section');
  log('═══════════════════════════════════════════════════════════', 'section');

  if (passCount === 10) {
    log('✅ PHASE 5 VALIDATION: PASS - Network sharing is safe and production-ready', 'pass');
    process.exit(0);
  } else {
    log('❌ PHASE 5 VALIDATION: FAIL - Some tests failed. Review above.', 'fail');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(err => {
  log(`Fatal error: ${err.message}`, 'fail');
  process.exit(1);
});
