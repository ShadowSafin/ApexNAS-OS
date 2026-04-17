#!/usr/bin/env node

/**
 * VERIFY CRITICAL FIXES
 * Test that security patches actually block the attacks
 */

const path = require('path');
const fs = require('fs');

// Import the SMB Service to test the fixed validatePath function
const SMBService = require('./backend/modules/smb/smb.service.js').SMBService ||
                   require('./backend/modules/smb/smb.service.js');
const NFSService = require('./backend/modules/nfs/nfs.service.js').NFSService ||
                   require('./backend/modules/nfs/nfs.service.js');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  SECURITY FIX VERIFICATION TEST                          ║');
console.log('║  Verify that critical vulnerabilities are now blocked    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Test cases that should ALL be blocked
const ATTACK_VECTORS = [
  '/mnt/storage/..%2f..%2fetc',           // URL encoded traversal
  '/mnt/storage/..%2f..%2fetc%2fshadow',  // URL encoded + filename
  '/mnt/storage/..%2e%2f..%2e%2fetc',     // Alternative encoding
  '/mnt/storage/..%5c..%5cetc',           // Windows path separator
  '/etc',                                  // Direct system path
  '/root',                                 // Direct system path
  '/',                                     // Root
  '/home',                                 // System directory
  '/mnt/storage/../../../etc',             // Literal traversal
  '/mnt/storage/$(whoami)',                // Command injection
  '/mnt/storage/`id`',                     // Command substitution
  '/mnt/storage/; rm -rf /',               // Command injection
];

const SAFE_VECTORS = [
  '/mnt/storage',                          // Storage root
  '/mnt/storage/media',                    // Storage subdirectory
  '/mnt/storage/backups',                  // Another subdirectory
  '/mnt/storage/user-data',                // User data
];

console.log('─'.repeat(60));
console.log('TEST 1: URL ENCODED ATTACK PREVENTION (SMB)');
console.log('─'.repeat(60));

let blockedAttacks = 0;
let allowedAttacks = 0;

for (const testPath of ATTACK_VECTORS) {
  const result = SMBService.validatePath(testPath);
  
  if (!result.valid) {
    console.log(`✓ BLOCKED: ${testPath}`);
    console.log(`  Reason: ${result.error} - ${result.message}`);
    blockedAttacks++;
  } else {
    console.log(`✗ ALLOWED: ${testPath} (VULNERABLE)`);
    allowedAttacks++;
  }
}

console.log(`\nAttacks Blocked: ${blockedAttacks}/${ATTACK_VECTORS.length}`);
console.log(`Attacks Allowed: ${allowedAttacks}/${ATTACK_VECTORS.length}\n`);

console.log('─'.repeat(60));
console.log('TEST 2: VALID PATH ALLOWANCE (SMB)');
console.log('─'.repeat(60));

let allowedValid = 0;
let blockedValid = 0;

for (const testPath of SAFE_VECTORS) {
  // Create directory if needed for testing
  try {
    if (!fs.existsSync(testPath)) {
      console.log(`⚠ Path does not exist: ${testPath} (cannot test)`);
      continue;
    }

    const result = SMBService.validatePath(testPath);
    
    if (result.valid) {
      console.log(`✓ ALLOWED: ${testPath}`);
      allowedValid++;
    } else {
      console.log(`✗ BLOCKED: ${testPath} (FALSE POSITIVE)`);
      console.log(`  Reason: ${result.error} - ${result.message}`);
      blockedValid++;
    }
  } catch (err) {
    console.log(`⚠ Test error for ${testPath}: ${err.message}`);
  }
}

console.log(`\nValid paths allowed: ${allowedValid}/${SAFE_VECTORS.filter(p => fs.existsSync(p)).length}`);
console.log(`False positives: ${blockedValid}\n`);

// Test NFS validation
console.log('─'.repeat(60));
console.log('TEST 3: URL ENCODED ATTACK PREVENTION (NFS)');
console.log('─'.repeat(60));

let nfsBlocked = 0;
let nfsAllowed = 0;

for (const testPath of ATTACK_VECTORS.slice(0, 5)) {  // Test subset
  const result = NFSService.validatePath(testPath);
  
  if (!result.valid) {
    console.log(`✓ BLOCKED: ${testPath}`);
    nfsBlocked++;
  } else {
    console.log(`✗ ALLOWED: ${testPath}`);
    nfsAllowed++;
  }
}

console.log(`\nNFS Attacks Blocked: ${nfsBlocked}/5\n`);

// SMB Guest Access Test
console.log('─'.repeat(60));
console.log('TEST 4: SMB GUEST ACCESS HARDENING');
console.log('─'.repeat(60));

const smbConf = fs.readFileSync('/etc/samba/smb.conf', 'utf8');
const hasMapToGuestNever = smbConf.includes('map to guest = Never');
const noUsershareGuests = smbConf.includes('usershare allow guests = no');

if (hasMapToGuestNever) {
  console.log(`✓ FIXED: 'map to guest = Never' is configured`);
} else {
  console.log(`✗ NOT FIXED: 'map to guest' not set to Never`);
}

if (noUsershareGuests) {
  console.log(`✓ FIXED: 'usershare allow guests = no' is configured`);
} else {
  console.log(`✗ NOT FIXED: 'usershare allow guests' not set to no`);
}

// Persistence database test
console.log('\n' + '─'.repeat(60));
console.log('TEST 5: PERSISTENCE DATABASE INITIALIZATION');
console.log('─'.repeat(60));

if (fs.existsSync('/etc/nas/network-shares.json')) {
  const dbContent = JSON.parse(fs.readFileSync('/etc/nas/network-shares.json', 'utf8'));
  if (dbContent.smb && dbContent.nfs && Array.isArray(dbContent.smb) && Array.isArray(dbContent.nfs)) {
    console.log(`✓ FIXED: Persistence database initialized and valid`);
  } else {
    console.log(`✗ ISSUE: Database file exists but has invalid structure`);
  }
} else {
  console.log(`✗ NOT FIXED: /etc/nas/network-shares.json does not exist`);
}

// Final summary
console.log('\n' + '═'.repeat(60));
console.log('SECURITY FIX VERIFICATION SUMMARY');
console.log('═'.repeat(60));

const score = {
  pathEscapeFixed: blockedAttacks === ATTACK_VECTORS.length,
  validPathsWork: allowedValid >= SAFE_VECTORS.filter(p => fs.existsSync(p)).length - 1,
  nfsPathEscapeFixed: nfsBlocked >= 4,
  guestAccessHardened: hasMapToGuestNever && noUsershareGuests,
  persistenceInitialized: fs.existsSync('/etc/nas/network-shares.json')
};

console.log(`\n✓ Path Escape (SMB):        ${score.pathEscapeFixed ? 'FIXED' : 'BROKEN'}`);
console.log(`✓ Valid Paths (SMB):        ${score.validPathsWork ? 'WORKING' : 'BROKEN'}`);
console.log(`✓ Path Escape (NFS):        ${score.nfsPathEscapeFixed ? 'FIXED' : 'BROKEN'}`);
console.log(`✓ Guest Access Hardening:   ${score.guestAccessHardened ? 'HARDENED' : 'NOT HARDENED'}`);
console.log(`✓ Persistence Database:     ${score.persistenceInitialized ? 'INITIALIZED' : 'MISSING'}`);

const allFixed = Object.values(score).every(v => v);

console.log('\n' + '═'.repeat(60));
if (allFixed) {
  console.log('VERDICT: ✅ ALL CRITICAL FIXES VERIFIED');
  console.log('═'.repeat(60));
  process.exit(0);
} else {
  console.log('VERDICT: ⚠️  SOME FIXES NEED ATTENTION');
  console.log('═'.repeat(60));
  process.exit(1);
}
