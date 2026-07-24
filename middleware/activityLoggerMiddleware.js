// middleware/activityLoggerMiddleware.js
const ActivityLogger = require('../services/activityLogger');
const crypto = require('crypto');

/**
 * Middleware to automatically log API requests
 */
const activityLoggerMiddleware = (action) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      const duration = Date.now() - startTime;
      const status = res.statusCode < 400 ? 'success' : 'failed';
      const errorMessage = res.statusCode >= 400 ? data?.message : null;

      // Extract target info from request
      const target = {};
      if (req.params.productId) {
        target.type = 'product';
        target.id = req.params.productId;
      } else if (req.params.orderId) {
        target.type = 'order';
        target.id = req.params.orderId;
      } else if (req.params.vendorId) {
        target.type = 'vendor';
        target.id = req.params.vendorId;
      }

      // Log the activity (fire and forget)
      ActivityLogger.log({
        action,
        user: req.user,
        req,
        target,
        metadata: {
          method: req.method,
          query: req.query,
          responseStatus: res.statusCode,
        },
        status,
        duration,
        errorMessage,
      });

      return originalJson(data);
    };

    next();
  };
};

/**
 * Middleware to generate and attach session ID
 */
const sessionMiddleware = (req, res, next) => {
  if (!req.headers['x-session-id']) {
    req.headers['x-session-id'] = `sess_${crypto.randomUUID()}`;
  }
  next();
};

module.exports = { activityLoggerMiddleware, sessionMiddleware };