const { z } = require('zod');

const rebootSchema = z.object({
  confirm: z.enum(['YES_REBOOT'], {
    errorMap: () => ({ message: 'Confirmation must be "YES_REBOOT"' })
  })
});

const shutdownSchema = z.object({
  confirm: z.enum(['YES_SHUTDOWN'], {
    errorMap: () => ({ message: 'Confirmation must be "YES_SHUTDOWN"' })
  })
});

const logsQuerySchema = z.object({
  service: z.enum(['system', 'smb', 'nfs', 'ftp'], {
    errorMap: () => ({ message: 'Service must be one of: system, smb, nfs, ftp' })
  }).default('system'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  since: z.string().optional(),
  until: z.string().optional()
});

module.exports = {
  rebootSchema,
  shutdownSchema,
  logsQuerySchema
};
