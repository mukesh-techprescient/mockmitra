import jwt from 'jsonwebtoken';

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return process.env.JWT_SECRET;
};

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role, name: user.name }, secret(), { expiresIn: '7d' });

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const p = jwt.verify(token, secret());
    req.user = { id: p.sub, role: p.role, name: p.name };
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
    next();
  });
}

// Wrap async handlers so thrown errors reach the error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
