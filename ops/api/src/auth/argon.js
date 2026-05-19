import argon2 from 'argon2';

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 1,
};

export async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('hashPassword: plain must be a non-empty string');
  }
  return argon2.hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(plain, hash) {
  if (typeof plain !== 'string' || typeof hash !== 'string') return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
