const { z } = require('zod');

const createPartitionSchema = z.object({
  device: z.string().regex(/^\/dev\/(sd|hd|nvme|vd|xvd)[a-z0-9]*$/, 'Invalid device'),
  start: z.string(),
  end: z.string(),
  fstype: z.enum(['ext4', 'xfs', 'btrfs', 'jfs']).optional().default('ext4')
});

const formatPartitionSchema = z.object({
  partition: z.string().regex(/^\/dev\/(sd|hd|nvme|vd|xvd)[a-z0-9]*$/, 'Invalid partition'),
  fstype: z.enum(['ext4', 'xfs', 'btrfs', 'jfs'])
});

const mountPartitionSchema = z.object({
  partition: z.string().regex(/^\/dev\/(sd|hd|nvme|vd|xvd)[a-z0-9]*$/, 'Invalid partition'),
  mountpoint: z.string().regex(/^\/mnt\/[\w\-\/]+$/, 'Mountpoint must start with /mnt/'),
  fstype: z.string().optional().default('auto')
});

const unmountPartitionSchema = z.object({
  mountpoint: z.string().regex(/^\/mnt\/[\w\-\/]+$/, 'Mountpoint must start with /mnt/')
});

const smartCheckSchema = z.object({
  device: z.string().regex(/^(sd|hd|nvme|vd|xvd)[a-z0-9]*$/, 'Invalid device')
});

module.exports = {
  createPartitionSchema,
  formatPartitionSchema,
  mountPartitionSchema,
  unmountPartitionSchema,
  smartCheckSchema
};
