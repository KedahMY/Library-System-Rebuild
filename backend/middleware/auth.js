// BiblioVault auth middleware — JWT token generation, authentication, authorization,
// and password validation helpers. Used by all protected API routes.
// Exports: authenticate, authorize, generateToken, authenticateWithFallback, validatePassword

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'library-system-secret-key-2024';

/**
 * Signs a JWT with user identity claims.
 * Payload: { id, username, role, full_name }
 * Expires in 24 hours.
 */
export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Express middleware that reads Authorization: Bearer <token>.
 * On success sets req.user = { id, username, role, full_name }.
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
      full_name: decoded.full_name,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Factory that returns middleware to restrict access to specific roles.
 * Must be used after `authenticate`.
 * Returns 403 JSON if the user's role is not in the allowed list.
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
 * Like authenticate, but also accepts the token from req.body._token.
 * Used by the recovery route for sendBeacon support (cannot set custom headers).
 */
export function authenticateWithFallback(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : (req.body && req.body._token);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      full_name: decoded.full_name,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Validates a password against the project's strength policy:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character (!@#$%^&*(),.?":{}|<>)
 *
 * Returns { valid: boolean, message: string }
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
  return { valid: true, message: '' };
}
