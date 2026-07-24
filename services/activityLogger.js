// services/activityLogger.js
const ActivityLog = require('../model/ActivityLog');
const crypto = require('crypto');

class ActivityLogger {
  /**
   * Log an activity
   * @param {Object} params
   * @param {string} params.action - The action being performed
   * @param {Object} params.user - User object (req.user)
   * @param {Object} params.req - Express request object (optional)
   * @param {Object} params.target - Target of the action { type, id, name }
   * @param {Object} params.metadata - Additional data to store
   * @param {string} params.status - 'success' | 'failed' | 'pending'
   * @param {number} params.duration - Duration in ms
   * @param {string} params.errorMessage - Error message if failed
   */
  static async log({
    action,
    user = null,
    req = null,
    target = {},
    metadata = {},
    status = 'success',
    duration = null,
    errorMessage = null,
  }) {
    try {
      const logEntry = {
        action,
        status,
        target: target.type ? target : undefined,
        metadata,
        duration,
        errorMessage,
      };

      // Extract user info
      if (user) {
        logEntry.user = user._id || user.id;
        logEntry.userType = user.role || user.userType || 'customer';
        logEntry.userName = user.name;
        logEntry.userPhone = user.phone;
        logEntry.userEmail = user.email;
        logEntry.location = {
          campus: user.campus,
          area: user.location?.campusArea,
        };
      }

      // Extract request info
      if (req) {
        logEntry.source = {
          platform: req.headers['x-platform'] || 'web',
          page: req.originalUrl,
          screen: req.headers['x-screen'],
          ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim(),
          userAgent: req.headers['user-agent'],
          deviceInfo: req.headers['x-device-info'],
        };
        logEntry.sessionId = req.headers['x-session-id'] || req.sessionID;
      }

      // Create the log (don't await - fire and forget for performance)
      ActivityLog.create(logEntry).catch(err => {
        console.error('Activity log creation failed:', err.message);
      });

    } catch (error) {
      console.error('ActivityLogger error:', error.message);
    }
  }

  /**
   * Log with timing - wraps an async function and logs duration
   */
  static async withTiming({ action, user, req, target, metadata }, fn) {
    const startTime = Date.now();
    let status = 'success';
    let errorMessage = null;

    try {
      const result = await fn();
      return result;
    } catch (error) {
      status = 'failed';
      errorMessage = error.message;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      await ActivityLogger.log({
        action,
        user,
        req,
        target,
        metadata,
        status,
        duration,
        errorMessage,
      });
    }
  }

  /**
   * Get activity logs with filtering
   */
  static async getLogs({
    userId,
    userType,
    action,
    targetType,
    targetId,
    status,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = {}) {
    const query = {};

    if (userId) query.user = userId;
    if (userType) query.userType = userType;
    if (action) query.action = action;
    if (targetType) query['target.type'] = targetType;
    if (targetId) query['target.id'] = targetId;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(query)
        .populate('user', 'name phone email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(query),
    ]);

    return {
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get activity summary/analytics
   */
  static async getSummary({ startDate, endDate, userType } = {}) {
    const match = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }
    if (userType) match.userType = userType;

    const summary = await ActivityLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$user' },
        },
      },
      {
        $project: {
          action: '$_id',
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' },
          _id: 0,
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Daily activity trend
    const dailyTrend = await ActivityLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: '$_id',
          count: 1,
          _id: 0,
        },
      },
    ]);

    return { summary, dailyTrend };
  }
}

module.exports = ActivityLogger;