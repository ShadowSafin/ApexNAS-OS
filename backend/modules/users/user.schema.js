/**
 * User Schema - Zod validation schemas for user operations
 */

const { z } = require('zod');

const usernameField = z.string()
  .min(1, 'Username must be at least 1 character')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,31}$/, 'Username must start with a letter and contain only letters, numbers, underscore, hyphen, or period');

const passwordField = z.string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password must be at most 128 characters');

const createUserSchema = z.object({
  username: usernameField,
  password: passwordField
});

const changePasswordSchema = z.object({
  password: passwordField
});

module.exports = {
  createUserSchema,
  changePasswordSchema,
  usernameField,
  passwordField
};
