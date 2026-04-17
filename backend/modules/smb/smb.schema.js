const { z } = require('zod');

/**
 * SMB Share Validation Schemas
 */

const createShareSchema = z.object({
  name: z.string().min(1, 'Share name is required').max(15, 'Share name must be under 15 chars'),
  path: z.string().min(1, 'Path is required'),
  comment: z.string().optional(),
  browseable: z.boolean().optional().default(true),
  writable: z.boolean().optional().default(false),
  guestOk: z.boolean().optional().default(false),
  validUsers: z.array(z.string()).optional().default([]),
  readList: z.array(z.string()).optional(),
  writeList: z.array(z.string()).optional()
}).strict();

const updateShareSchema = z.object({
  name: z.string().min(1, 'Share name is required'),
  comment: z.string().optional(),
  browseable: z.boolean().optional(),
  writable: z.boolean().optional(),
  guestOk: z.boolean().optional(),
  validUsers: z.array(z.string()).optional(),
  readList: z.array(z.string()).optional(),
  writeList: z.array(z.string()).optional()
}).strict();

const deleteShareSchema = z.object({
  name: z.string().min(1, 'Share name is required')
}).strict();

module.exports = {
  createShareSchema,
  updateShareSchema,
  deleteShareSchema
};
