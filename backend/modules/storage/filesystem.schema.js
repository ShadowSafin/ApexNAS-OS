const { z } = require('zod');

/**
 * Filesystem Validation Schemas
 */

const createFilesystemSchema = z.object({
  device: z.string().min(1, 'Device is required').describe('Device path e.g. /dev/sdb1'),
  type: z.enum(['ext4', 'xfs', 'btrfs', 'ext3'], {
    errorMap: () => ({ message: 'Invalid filesystem type' })
  }),
  label: z.string().optional(),
  simulation: z.boolean().optional().default(true),
  confirm: z.string().optional().describe('Confirmation string for real execution')
}).strict();

const mountFilesystemSchema = z.object({
  device: z.string().min(1, 'Device is required'),
  mountpoint: z.string().min(1, 'Mount point is required'),
  fstype: z.string().optional(),
  options: z.string().optional().default('defaults')
}).strict();

const unmountFilesystemSchema = z.object({
  mountpoint: z.string().min(1, 'Mount point is required'),
  force: z.boolean().optional().default(false)
}).strict();

const detectFilesystemSchema = z.object({
  device: z.string().min(1, 'Device is required')
}).strict();

module.exports = {
  createFilesystemSchema,
  mountFilesystemSchema,
  unmountFilesystemSchema,
  detectFilesystemSchema
};
