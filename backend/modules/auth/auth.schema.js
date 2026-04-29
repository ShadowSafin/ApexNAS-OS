const { z } = require('zod');

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'Password must be at least 6 characters')
});

const changeUsernameSchema = z.object({
  newUsername: z.string().min(3, 'Username must be at least 3 characters').max(32, 'Username must be at most 32 characters').regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, dots, hyphens, and underscores'),
  password: z.string().min(1)
});

module.exports = { loginSchema, refreshSchema, changePasswordSchema, changeUsernameSchema };
