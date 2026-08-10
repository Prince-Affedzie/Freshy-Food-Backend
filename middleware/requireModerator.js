// middleware/requireModerator.js
//
// Assumes a `role` field on your User model, same pattern already used
// client-side for vendor checks (`user?.role !== 'vendor'`). Adjust the
// allowed roles list if your role naming differs.
const requireModerator = (req, res, next) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "moderator") {
    return res.status(403).json({ success: false, message: "Moderator access required" });
  }
  next();
};

module.exports = { requireModerator };