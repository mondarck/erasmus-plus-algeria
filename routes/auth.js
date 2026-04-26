const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { sql } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, faculty: u.faculty, phone: u.phone, applicant_type: u.applicant_type };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, phone, email, password, faculty, applicant_type } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'يرجى ملء جميع الحقول المطلوبة (الاسم، البريد، كلمة المرور)' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
  }

  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'هذا البريد الإلكتروني مستخدم مسبقاً' });
    }

    const hash = await bcrypt.hash(password, 12);
    const [user] = await sql`
      INSERT INTO users (name, phone, email, password_hash, role, faculty, applicant_type)
      VALUES (${name}, ${phone || null}, ${email.toLowerCase()}, ${hash}, 'student', ${faculty || null}, ${applicant_type || 'طالب'})
      RETURNING *
    `;

    res.status(201).json({ token: signToken(user), user: safeUser(user) });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
  }

  try {
    const [user] = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
    if (!user) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    res.json({ token: signToken(user), user: safeUser(user) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/auth/me  — verify token & return fresh user data
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [user] = await sql`SELECT * FROM users WHERE id = ${req.user.id}`;
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json(safeUser(user));
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// PATCH /api/auth/profile  — update own profile
router.patch('/profile', authMiddleware, async (req, res) => {
  const { name, phone, faculty } = req.body;
  try {
    const [user] = await sql`
      UPDATE users SET
        name    = COALESCE(${name    || null}, name),
        phone   = COALESCE(${phone   || null}, phone),
        faculty = COALESCE(${faculty || null}, faculty)
      WHERE id = ${req.user.id}
      RETURNING *
    `;
    res.json(safeUser(user));
  } catch (err) {
    console.error('profile update error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// PATCH /api/auth/password  — change own password
router.patch('/password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية والجديدة' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' });
  }
  try {
    const [user] = await sql`SELECT password_hash FROM users WHERE id = ${req.user.id}`;
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });

    const hash = await bcrypt.hash(new_password, 12);
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${req.user.id}`;
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    console.error('password change error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/auth/users  — list all users (admin + superadmin)
router.get('/users', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const users = await sql`
      SELECT id, name, email, role, faculty, phone, created_at
      FROM users
      ORDER BY created_at DESC
    `;
    res.json(users);
  } catch (err) {
    console.error('users list error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// POST /api/auth/create-admin  — create admin/superadmin account (superadmin only)
router.post('/create-admin', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { name, email, password, role = 'admin' } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
  }
  if (!['admin', 'superadmin'].includes(role)) {
    return res.status(400).json({ error: 'الدور غير صالح' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
  }

  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'هذا البريد الإلكتروني مستخدم مسبقاً' });
    }

    const hash = await bcrypt.hash(password, 12);
    const [user] = await sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (${name}, ${email.toLowerCase()}, ${hash}, ${role})
      RETURNING *
    `;
    res.status(201).json(safeUser(user));
  } catch (err) {
    console.error('create-admin error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
