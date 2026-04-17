const cron = require('node-cron');

function schedule(expression, fn, options = {}) {
  if (!cron.validate(expression)) {
    throw new Error('Invalid cron expression');
  }

  return cron.schedule(expression, fn, { scheduled: true, ...options });
}

function stop(task) {
  if (task && typeof task.stop === 'function') {
    task.stop();
  }
}

module.exports = { schedule, stop };
