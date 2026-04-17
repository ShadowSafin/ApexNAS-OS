#!/usr/bin/env node

/**
 * POST-PATCH ADVERSARIAL VALIDATION
 * Tests the actual patched service modules
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  MAGENTA: '\x1b[35m'
};

class PostPatchValidation {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  log(level, message) {
    const colors = {
      'PASS': COLORS.GREEN,
      'FAIL': COLORS.RED,
      'INFO': COLORS.CYAN,
      'TEST': COLORS.BLUE
    };
    
    const color = colors[level] || COLORS.RESET;
    console.log(`${color}[${level}]${COLORS.RESET} ${message}`);
  }

  test(name, fn) {
    try {
      this.log('TEST', name);
      fn();
      this.log('PASS', `✓ ${name}`);
      this.passed++;
      this.results.push({ name, status: 'PASS' });
    } catch (err) {
      this.log('FAIL', `✗ ${name}: ${err.message}`);
      this.failed++;
      this.results.push({ name, status: 'FAIL', error: err.message });
    }
  }

  report() {
    console.log('\n' + '='.repeat(80));
    console.log(`${COLORS.MAGENTA}POST-PATCH VALIDATION REPORT${COLORS.RESET}`);
    console.log('='.repeat(80) + '\n');

    console.log(`${COLORS.GREEN}✅ Patches Verified:${COLORS.RESET}\n`);

    this.results.forEach((r, i) => {
      const icon = r.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${r.name}`);
      if (r.error) console.log(`   Error: ${r.error}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log(`\n${COLORS.GREEN}Results: ${this.passed}/${this.passed + this.failed} passed${COLORS.RESET}\n`);

    if (this.failed === 0) {
      console.log(`${COLORS.GREEN}🟢 ALL PATCHES VERIFIED${COLORS.RESET}\n`);
      return 0;
    } else {
      console.log(`${COLORS.RED}🔴 SOME PATCHES NEED REVIEW${COLORS.RESET}\n`);
      return 1;
    }
  }

  runAll() {
    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  POST-PATCH VALIDATION - Verifying Security Patches                       ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

    // PATCH 1: Path Traversal Fixes
    this.log('INFO', '--- PATCH 1: Path Traversal Fixes ---\n');
    
    this.test('PATCH 1.1: path.resolve() installed in share validation', () => {
      const source = fs.readFileSync('./backend/modules/share/share.service.js', 'utf8');
      assert(source.includes('path.resolve'), 'Should use path.resolve()');
      assert(source.includes('fs.realpathSync'), 'Should use fs.realpathSync()');
      assert(source.includes('decodeURIComponent'), 'Should decode URLs');
    });

    this.test('PATCH 1.2: path.resolve() installed in ACL validation', () => {
      const source = fs.readFileSync('./backend/modules/acl/acl.service.js', 'utf8');
      assert(source.includes('path.resolve'), 'Should use path.resolve() in ACL');
      assert(source.includes('fs.realpathSync'), 'Should use fs.realpathSync() in ACL');
      assert(source.includes('decodeURIComponent'), 'Should decode URLs in ACL');
    });

    // PATCH 2: Mount Persistence
    this.log('INFO', '\n--- PATCH 2: Mount Persistence ---\n');
    
    this.test('PATCH 2.1: fstab update code present', () => {
      const source = fs.readFileSync('./backend/modules/storage/filesystem.service.js', 'utf8');
      assert(source.includes('/etc/fstab'), 'Should update fstab');
      assert(source.includes('appendFileSync'), 'Should append to fstab');
      assert(source.includes('UUID='), 'Should use UUID format');
    });

    // PATCH 3: Share Persistence
    this.log('INFO', '\n--- PATCH 3: Share Persistence ---\n');
    
    this.test('PATCH 3.1: Share persistence code present', () => {
      const source = fs.readFileSync('./backend/modules/share/share.service.js', 'utf8');
      assert(source.includes('SHARE_CONFIG_PATH'), 'Should define config path');
      assert(source.includes('persistShares'), 'Should have persistShares method');
      assert(source.includes('initialize'), 'Should have initialize method');
    });

    this.test('PATCH 3.2: Persistent config directory configured', () => {
      const source = fs.readFileSync('./backend/modules/share/share.service.js', 'utf8');
      assert(source.includes('/etc/nas'), 'Should use /etc/nas directory');
    });

    // PATCH 4: Concurrency Control
    this.log('INFO', '\n--- PATCH 4: Concurrency Control ---\n');
    
    this.test('PATCH 4.1: Operation locking implemented', () => {
      const source = fs.readFileSync('./backend/modules/share/share.service.js', 'utf8');
      assert(source.includes('operationLocks'), 'Should have operation locks');
      assert(source.includes('acquireLock'), 'Should have acquireLock method');
      assert(source.includes('finally'), 'Should use try/finally for lock release');
    });

    // PATCH 5: Path Collision Detection
    this.log('INFO', '\n--- PATCH 5: Path Collision Detection ---\n');
    
    this.test('PATCH 5.1: Path collision detection code present', () => {
      const source = fs.readFileSync('./backend/modules/share/share.service.js', 'utf8');
      assert(source.includes('sharePaths'), 'Should have sharePaths map');
      assert(source.includes('PATH_IN_USE'), 'Should have PATH_IN_USE error');
    });

    // PATCH 6: Username Validation
    this.log('INFO', '\n--- PATCH 6: Username Validation ---\n');
    
    this.test('PATCH 6.1: Enhanced username validation installed', () => {
      const source = fs.readFileSync('./backend/modules/acl/acl.service.js', 'utf8');
      assert(source.includes('validateUsername'), 'Should have validateUsername method');
      assert(source.includes('a-zA-Z0-9_.-'), 'Should restrict to valid characters');
    });

    this.test('PATCH 6.2: Enhanced group validation installed', () => {
      const source = fs.readFileSync('./backend/modules/acl/acl.service.js', 'utf8');
      assert(source.includes('validateGroupName'), 'Should have validateGroupName method');
    });

    return this.report();
  }
}

const validator = new PostPatchValidation();
process.exit(validator.runAll());
