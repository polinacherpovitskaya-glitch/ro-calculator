import { hashPassword } from '../src/auth/argon.js';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node hash.mjs <password>');
  process.exit(1);
}

console.log(await hashPassword(password));
