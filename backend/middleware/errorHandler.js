const { ZodError } = require('zod');
const { ExecutorError } = require('../lib/executor');
const logger = require('../lib/logger');
const config = require('../config');

function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
      issues: err.errors
    });
  }

  if (err instanceof ExecutorError) {
    return res.status(500).json({
      success: false,
      error: 'EXECUTOR_ERROR',
      message: err.message,
      command: err.command,
      args: err.args,
      exitCode: err.exitCode,
      stderr: err.stderr
    });
  }

  const response = {
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred'
  };
  if (config.nodeEnv !== 'production') {
    response.stack = err.stack;
  }

  res.status(500).json(response);
}

module.exports = errorHandler;
