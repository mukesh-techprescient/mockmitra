import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User.js';
import { signToken, requireAuth, ah } from '../lib/auth.js';

const r = Router();

const registerBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

r.post('/register', ah(async (req, res) => {
  const body = registerBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Name, valid email and an 8+ character password are required' });
  const { name, email, password } = body.data;
  if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ error: 'An account with this email already exists' });
  // Self-registration always creates students; admins come from scripts/seed-admin.js.
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: signToken(user), user: user.toPublic() });
}));

r.post('/login', ah(async (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: signToken(user), user: user.toPublic() });
}));

r.get('/me', requireAuth, ah(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  res.json({ user: user.toPublic() });
}));

export default r;
