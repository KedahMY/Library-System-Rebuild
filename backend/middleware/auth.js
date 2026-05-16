import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'library-system-secret-key-2024';

/**
 * Generate a JWT token for the given user.
 * Signs { id, username, role, full_name } with expiresIn '24h'.
 */
export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Authenticate middleware — reads Authorization: Bearer <token> header.
 * On success sets req.user = { id, username, role, full_name } and calls next().
 * Returns 401 JSON if missing, invalid, or expired.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      full_name: decoded.full_name
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Authorize middleware factory — returns middleware that calls next() if
 * req.user.role is one of the supplied roles, or 403 otherwise.
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
}

/**
 * Validate password strength.
 * Returns { valid: true } or { valid: false, message: '...' }.
 * Rules: 8+ chars, >=1 uppercase, >=1 lowercase, >=1 digit, >=1 special.
 */
export function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one digit' };
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  return { valid: true };
}
