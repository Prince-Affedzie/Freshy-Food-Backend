const jwt = require("jsonwebtoken");

const auth = async (req, res, next) => {
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

    
    // 3. If no token at all
    if (!token) {
      return res.status(403).json({ message: "No token provided" });
    }

    // 4. Verify token
    const decoded = jwt.verify(token, process.env.token);
    req.user = decoded;

    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = { auth };
