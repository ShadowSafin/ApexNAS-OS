const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const usersFile = path.join(config.dataDir, 'users.json');

if (fs.existsSync(usersFile)) {
  console.log('Seed skipped: users.json already exists.');
  process.exit(0);
}

const passwordHash = bcrypt.hashSync('nasos_admin', 12);

const user = {
  id: uuidv4(),
  username: 'admin',
  passwordHash,
  role: 'admin',
  createdAt: new Date().toISOString(),
  lastLogin: null
};

fs.writeFileSync(usersFile, JSON.stringify([user], null, 2), 'utf-8');
console.log('Seed complete: admin user created in users.json');
