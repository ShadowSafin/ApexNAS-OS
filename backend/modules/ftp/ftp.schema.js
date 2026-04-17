const { z } = require('zod');

const enableFTPSchema = z.object({
  port: z.number().int().min(1).max(65535).optional().default(21),
  passivePortMin: z.number().int().min(1024).max(65535).optional().default(6000),
  passivePortMax: z.number().int().min(1024).max(65535).optional().default(6100)
});

const updateFTPSchema = z.object({
  enabled: z.boolean().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  passivePortMin: z.number().int().min(1024).max(65535).optional(),
  passivePortMax: z.number().int().min(1024).max(65535).optional(),
  allowAnonymous: z.boolean().optional().default(false),
  umask: z.string().regex(/^[0-7]{3}$/).optional().default('077')
});

const addFTPUserSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_\-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  homeDir: z.string().refine(
    (path) => path.startsWith('/mnt/storage'),
    'Home directory must be under /mnt/storage'
  )
});

const removeFTPUserSchema = z.object({
  username: z.string().min(3).max(32)
});

module.exports = {
  enableFTPSchema,
  updateFTPSchema,
  addFTPUserSchema,
  removeFTPUserSchema
};
