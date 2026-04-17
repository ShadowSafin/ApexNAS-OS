const { z } = require('zod');

/**
 * NFS Export Validation Schemas
 */

const clientConfigSchema = z.object({
  ip: z.string().min(1, 'IP/CIDR is required'),
  options: z.string().optional().default('rw,sync,subtree_check')
});

const createExportSchema = z.object({
  name: z.string().min(1, 'Export name is required'),
  path: z.string().min(1, 'Export path is required'),
  clients: z.array(clientConfigSchema).min(1, 'At least one client must be specified'),
  fsid: z.number().optional(),
  anonuid: z.number().optional().default(65534),
  anongid: z.number().optional().default(65534)
}).strict();

const updateExportSchema = z.object({
  name: z.string().min(1, 'Export name is required'),
  path: z.string().optional(),
  clients: z.array(clientConfigSchema).optional(),
  fsid: z.number().optional(),
  anonuid: z.number().optional(),
  anongid: z.number().optional()
}).strict();

const deleteExportSchema = z.object({
  name: z.string().min(1, 'Export name is required')
}).strict();

module.exports = {
  createExportSchema,
  updateExportSchema,
  deleteExportSchema,
  clientConfigSchema
};
