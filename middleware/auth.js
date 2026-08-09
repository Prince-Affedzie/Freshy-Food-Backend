// middleware/auth.js
const jwt = require("jsonwebtoken");

const auth = async (req, res, next) => {
  console.log("At Auth receiving request")
  try {
    let token;

    // 1. Check cookies first (for web)
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // 2. If no cookie, check Authorization header (for mobile app)
    else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    console.log(token)
    // 3. If no token at all
    if (!token) {
      return res.status(403).json({ message: "No token provided" });
    }

    // 4. Verify token
    console.log(token)
    const decoded = jwt.verify(token, process.env.token);
    
    req.user = decoded;
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// ─── Admin Auth Middleware ────────────────────────────────────────────────────
const adminAuth = async (req, res, next) => {
  try {
    // auth middleware must run before this to set req.user
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  } catch (err) {
    console.error("Admin auth error:", err.message);
    res.status(500).json({ message: "Authorization check failed" });
  }
};

module.exports = { auth, adminAuth };