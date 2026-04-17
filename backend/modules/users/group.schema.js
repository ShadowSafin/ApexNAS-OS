/**
 * Group Schema - Zod validation schemas for group operations
 */

const { z } = require('zod');

const groupNameField = z.string()
  .min(1, 'Group name must be at least 1 character')
  .max(32, 'Group name must be at most 32 characters')
  .regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,31}$/, 'Group name must start with a letter and contain only letters, numbers, underscore, hyphen, or period');

const createGroupSchema = z.object({
  name: groupNameField
});

const addMemberSchema = z.object({
  username: z.string()
    .min(1, 'Username must be at least 1 character')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,31}$/, 'Invalid username format')
});

module.exports = {
  createGroupSchema,
  addMemberSchema,
  groupNameField
};
