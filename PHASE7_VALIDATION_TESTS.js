#!/usr/bin/env node

/**
 * Phase 7 Validation Tests
 * 
 * Validates FTP and App Installer functionality
 * - FTP service enable/disable
 * - FTP user management
 * - App catalog loading
 * - App installation flow
 * - App lifecycle management
 * - Security validations
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const API_PREFIX = '/api';
const TEST_USER_TOKEN = process.env.TEST_TOKEN || 'test-token';
const TIMEOUT = 10000;

// Test results
let testsPassed = 0;
let testsFailed = 0;
const failedTests = [];

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

/**
 * Make HTTP request
 */
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_USER_TOKEN}`
      },
      timeout: TIMEOUT
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const jsonBody = body ? JSON.parse(body) : null;
          resolve({
            status: res.statusCode,
            data: jsonBody,
            headers: res.headers
          });
        } catch (err) {
          resolve({
            status: res.statusCode,
            data: body,
            headers: res.headers
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * Test helper
 */
async function test(name, fn) {
  try {
    await fn();
    console.log(`${colors.green}✓${colors.reset} ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    console.log(`  Error: ${err.message}`);
    testsFailed++;
    failedTests.push({ name, error: err.message });
  }
}

/**
 * Assertion helpers
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${expected}, got ${actual})`);
  }
}

function assertExists(value, message) {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}

function assertIsArray(value, message) {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
}

/**
 * Phase 7 Tests
 */
async function runTests() {
  console.log(`\n${colors.blue}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║ PHASE 7: FTP & APP INSTALLER VALIDATION TESTS         ║${colors.reset}`);
  console.log(`${colors.blue}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);

  // FTP Tests
  console.log(`${colors.blue}→ FTP Service Tests${colors.reset}\n`);

  await test('FTP: Get initial status', async () => {
    const res = await makeRequest('GET', `${API_PREFIX}/ftp/status`);
    assertEquals(res.status, 200, 'FTP status endpoint should return 200');
    assertExists(res.data.data, 'Response should contain data');
    assertExists(res.data.data.port, 'FTP status should include port');
  });

  await test('FTP: Enable FTP service', async () => {
    const res = await makeRequest('POST', `${API_PREFIX}/ftp/enable`, {
      port: 21,
      passivePortMin: 6000,
      passivePortMax: 6100
    });
    assertEquals(res.status, 200, 'Enable FTP should return 200');
    assertExists(res.data.message, 'Should have success message');
  });

  await test('FTP: Verify FTP is enabled', async () => {
    const res = await makeRequest('GET', `${API_PREFIX}/ftp/status`);
    assertEquals(res.status, 200, 'FTP status should return 200');
    assertEquals(res.data.data.enabled, true, 'FTP should be enabled');
  });

  await test('FTP: Add FTP user', async () => {
    const res = await makeRequest('POST', `${API_PREFIX}/ftp/users`, {
      username: 'testftpuser',
      password: 'TestPassword123!',
      homeDir: '/mnt/storage/ftp'
    });
    assertEquals(res.status, 200, 'Add user should return 200');
    assertExists(res.data.data.username, 'Response should include username');
  });

  await test('FTP: List FTP users', async () => {
    const res = await makeRequest('GET', `${API_PREFIX}/ftp/users`);
    assertEquals(res.status, 200, 'List users should return 200');
    assertIsArray(res.data.data, 'Response should be an array');
    assert(res.data.data.length > 0, 'Should have at least one user');
  });

  await test('FTP: Reject user with invalid home directory', async () => {
    const res = await makeRequest('POST', `${API_PREFIX}/ftp/users`, {
      username: 'baddiruser',
      password: 'TestPassword123!',
      homeDir: '/etc/passwords'
    });
    assertEquals(res.status, 400, 'Should reject path outside /mnt/storage');
  });

  await test('FTP: Remove FTP user', async () => {
    const res = await makeRequest('DELETE', `${API_PREFIX}/ftp/users/testftpuser`);
    assertEquals(res.status, 200, 'Remove user should return 200');
    assertExists(res.data.message, 'Should have success message');
  });

  await test('FTP: Disable FTP service', async () => {
    const res = await makeRequest('POST', `${API_PREFIX}/ftp/disable`);
    assertEquals(res.status, 200, 'Disable FTP should return 200');
  });

  await test('FTP: Verify FTP is disabled', async () => {
    const res = await makeRequest('GET', `${API_PREFIX}/ftp/status`);
    assertEquals(res.status, 200, 'Status check should return 200');
    assertEquals(res.data.data.enabled, false, 'FTP should be disabled');
  });

  // App Installer Tests
  console.log(`${colors.blue}\n→ App Installer Tests${colors.reset}\n`);

  await test('Apps: Get catalog', async () => {
    const res = await makeRequest('GET', `${API_PREFIX}/apps/catalog`);
    assertEquals(res.status, 200, 'Catalog should return 200');
    assertIsArray(res.data.data, 'Catalog should be an array');
    assert(res.data.data.length > 0, 'Catalog should have apps');
  });

  let firstAppId = null;
  await test('Apps: Catalog contains valid structures', async () => {
    const res = await makeRequest('GET', `${API_PREFIX}/apps/catalog`);
    assertIsArray(res.data.data, 'Should be array');
    const app = res.data.data[0];
    assertExists(app.id, 'App should have id');
    assertExists(app.name, 'App should have name');
    assertExists(app.image, 'App should have image');
    assertIsArray(app.volumes, 'App should have volumes array');
    firstAppId = app.id;
  });

  await test('Apps: Get installed apps list', async () => {
    const res = await makeRequest('GET', `${API_PREFIX}/apps/installed`);
    assertEquals(res.status, 200, 'Installed apps should return 200');
    assertIsArray(res.data.data, 'Should be an array');
  });

  let testContainerId = null;
  await test('Apps: Install app from catalog', async () => {
    if (!firstAppId) {
      throw new Error('No app ID available');
    }
    const res = await makeRequest('POST', `${API_PREFIX}/apps/install`, {
      appId: firstAppId
    });
    assertEquals(res.status, 200, 'Install should return 200');
    assertExists(res.data.data.containerId, 'Should have container ID');
    testContainerId = res.data.data.containerId;
  });

  await test('Apps: Verify app is in installed list', async () => {
    const res = await makeRequest('GET', `${API_PREFIX}/apps/installed`);
    assertEquals(res.status, 200, 'Should return 200');
    assertIsArray(res.data.data, 'Should be array');
    const found = res.data.data.some(a => a.id === firstAppId);
    assert(found, `App ${firstAppId} should be in installed list`);
  });

  await test('Apps: Catalog volumes restricted to /mnt/storage', async () => {
    const res = await makeRequest('GET', `${API_PREFIX}/apps/catalog`);
    const apps = res.data.data;
    for (const app of apps) {
      for (const volume of app.volumes || []) {
        const path = volume.host;
        assert(
          path.startsWith('/mnt/storage') || path === '/var/run/docker.sock',
          `Volume path ${path} must be in /mnt/storage or docker.sock`
        );
      }
    }
  });

  await test('Apps: Catalog has no privileged containers', async () => {
    const res = await makeRequest('GET', `${API_PREFIX}/apps/catalog`);
    const apps = res.data.data;
    for (const app of apps) {
      assertEquals(app.privileged, false, `App ${app.id} should not be privileged`);
    }
  });

  if (testContainerId) {
    await test('Apps: Stop container', async () => {
      const res = await makeRequest('POST', `${API_PREFIX}/apps/stop`, {
        containerId: testContainerId
      });
      assertEquals(res.status, 200, 'Stop should return 200');
    });

    await test('Apps: Start container', async () => {
      const res = await makeRequest('POST', `${API_PREFIX}/apps/start`, {
        containerId: testContainerId
      });
      assertEquals(res.status, 200, 'Start should return 200');
    });

    await test('Apps: Remove container', async () => {
      const res = await makeRequest('DELETE', `${API_PREFIX}/apps/remove`, {
        containerId: testContainerId,
        removeVolumes: false
      });
      assertEquals(res.status, 200, 'Remove should return 200');
    });
  }

  // Security Tests
  console.log(`${colors.blue}\n→ Security Validation Tests${colors.reset}\n`);

  await test('Security: FTP blocks system paths', async () => {
    const res = await makeRequest('POST', `${API_PREFIX}/ftp/users`, {
      username: 'hacker',
      password: 'BadPassword123!',
      homeDir: '/etc'
    });
    assert(res.status !== 200, 'Should reject /etc directory');
  });

  await test('Security: FTP blocks root paths', async () => {
    const res = await makeRequest('POST', `${API_PREFIX}/ftp/users`, {
      username: 'hacker2',
      password: 'BadPassword123!',
      homeDir: '/root'
    });
    assert(res.status !== 200, 'Should reject /root directory');
  });

  // Summary
  console.log(`\n${colors.blue}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║ TEST RESULTS${colors.reset}`);
  console.log(`${colors.blue}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);

  console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);

  if (failedTests.length > 0) {
    console.log(`\n${colors.yellow}Failed Tests:${colors.reset}`);
    failedTests.forEach(t => {
      console.log(`  • ${t.name}`);
    });
  }

  const total = testsPassed + testsFailed;
  const percentage = total > 0 ? ((testsPassed / total) * 100).toFixed(1) : 0;
  console.log(`\nTotal: ${total} tests (${percentage}% pass rate)\n`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((err) => {
  console.error(`${colors.red}Fatal error: ${err.message}${colors.reset}`);
  process.exit(1);
});
