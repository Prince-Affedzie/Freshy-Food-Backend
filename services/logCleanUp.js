// services/logCleanup.js
const ActivityLog = require('../model/ActivityLog');

/**
 * Delete logs older than specified days
 * Run this as a scheduled job (e.g., once a day)
 */
const cleanupOldLogs = async (daysToKeep = 90) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await ActivityLog.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    console.log(`🧹 Cleaned up ${result.deletedCount} activity logs older than ${daysToKeep} days`);
    return result.deletedCount;
  } catch (error) {
    console.error('Log cleanup error:', error);
  }
};

// Run every day at 3 AM
const scheduleCleanup = () => {
  const now = new Date();
  const night = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    3, 0, 0
  );
  const msUntilNight = night.getTime() - now.getTime();

  setTimeout(() => {
    cleanupOldLogs(90);
    setInterval(() => cleanupOldLogs(90), 24 * 60 * 60 * 1000);
  }, msUntilNight);
};

module.exports = { cleanupOldLogs, scheduleCleanup };