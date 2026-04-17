const { execFile } = require('child_process');
const path = require('path');
const logger = require('./logger');
const config = require('../config');

class ExecutorError extends Error {
  constructor(message, { command, args, exitCode, stderr } = {}) {
    super(message);
    this.name = 'ExecutorError';
    this.command = command;
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

const ALLOWED_COMMANDS = config.allowedCommands;

function isAbsolutePath(command) {
  return path.isAbsolute(command);
}

function isAllowedCommand(command) {
  const resolved = path.basename(command);
  return ALLOWED_COMMANDS.has(resolved);
}

function parseOutput(stdout) {
  if (!stdout) return [];
  return stdout
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function execute(command, args = [], options = {}) {
  if (typeof command !== 'string' || !command.trim()) {
    throw new ExecutorError('Invalid command', { command, args });
  }

  if (!Array.isArray(args)) {
    throw new ExecutorError('Arguments must be an array', { command, args });
  }

  if (!isAbsolutePath(command) && !isAllowedCommand(command)) {
    throw new ExecutorError('Command not allowed', { command, args });
  }

  const timeout = options.timeout || 30000;

  logger.info('executor: executing command', { command, args, timeout });

  return new Promise((resolve, reject) => {
    const startAt = Date.now();

    const child = execFile(command, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      const duration = Date.now() - startAt;
      const exitCode = err && typeof err.code === 'number' ? err.code : 0;

      logger.info('executor: command completed', {
        command,
        args,
        duration,
        exitCode,
        stderr: stderr ? stderr.toString() : ''
      });

      if (err) {
        const executorError = new ExecutorError('Command execution failed', {
          command,
          args,
          exitCode,
          stderr: stderr ? stderr.toString() : ''
        });
        return reject(executorError);
      }

      resolve({ stdout: stdout.toString(), stderr: stderr.toString(), exitCode });
    });

    if (options.input && child.stdin) {
      child.stdin.write(options.input);
      child.stdin.end();
    }

    child.on('error', (procErr) => {
      const duration = Date.now() - startAt;
      logger.error('executor: process error', { command, args, duration, error: procErr.message });
      reject(new ExecutorError('Process error', { command, args, stderr: procErr.message }));
    });
  });
}

module.exports = {
  execute,
  ExecutorError,
  parseOutput,
  ALLOWED_COMMANDS
};
