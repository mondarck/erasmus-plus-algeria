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

const APPLICANT_TYPE_MAP = {
  master_student:        'master_student',
  phd_student:           'phd_student',
  administrative_staff:  'administrative_staff',
  academic_professor:    'academic_professor',
  'طالب ماستر':          'master_student',
  'طالب دكتوراه':         'phd_student',
  'موظف اداري':          'administrative_staff',
  'موظف إداري':          'administrative_staff',
  'موظف استاذ':          'academic_professor',
  'موظف أستاذ':          'academic_professor'
};

function normalizeApplicantType(value) {
  if (!value || typeof value !== 'string') return null;
  return APPLICANT_TYPE_MAP[value.trim()] || null;
}

function safeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    faculty: u.faculty,
    phone: u.phone,
    applicant_type: u.applicant_type,
    is_active: u.is_active,
    preferred_language: u.preferred_language || 'en'
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, phone, email, password, faculty, applicant_type, preferred_language } = req.body;
  const normalizedType = normalizeApplicantType(applicant_type);

  if (!name || !email || !password || !normalizedType) {
    return res.status(400).json({ error: 'Please provide name, email, password, and applicant type.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const emailLower = email.toLowerCase().trim();
    const existing = await sql`SELECT id FROM users WHERE email = ${emailLower}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    const isActive = emailLower.endsWith('@univ-eloued.dz');
    const hash = await bcrypt.hash(password, 12);
    const [user] = await sql`
      INSERT INTO users (name, phone, email, password_hash, role, faculty, applicant_type, is_active, preferred_language)
      VALUES (${name}, ${phone || null}, ${emailLower}, ${hash}, 'student', ${faculty || null}, ${normalizedType}, ${isActive}, ${preferred_language || 'en'})
      RETURNING *
    `;

    if (!isActive) {
      return res.status(201).json({
        user: safeUser(user),
        pending: true,
        message: 'Your account has been created and is pending admin approval. A university email (@univ-eloued.dz) will be activated automatically.'
      });
    }

    res.status(201).json({ token: signToken(user), user: safeUser(user) });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter email and password.' });
  }

  try {
    const [user] = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Your account is not active yet. Please wait for admin approval.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    res.json({ token: signToken(user), user: safeUser(user) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
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
      SELECT id, name, email, role, faculty, phone, applicant_type, is_active, preferred_language, created_at
      FROM users
      ORDER BY created_at DESC
    `;
    res.json(users);
  } catch (err) {
    console.error('users list error:', err);
    res.status(500).json({ error: 'Server error while listing users.' });
  }
});

// PATCH /api/auth/users/:id/activate — admin or superadmin can activate/pause accounts
router.patch('/users/:id/activate', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  const userId = Number(req.params.id);
  const { activate } = req.body;
  if (typeof activate !== 'boolean') {
    return res.status(400).json({ error: 'activate must be true or false.' });
  }

  try {
    const [user] = await sql`
      UPDATE users SET is_active = ${activate}
      WHERE id = ${userId}
      RETURNING *
    `;
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(safeUser(user));
  } catch (err) {
    console.error('user activation error:', err);
    res.status(500).json({ error: 'Server error while updating user status.' });
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
      INSERT INTO users (name, email, password_hash, role, is_active)
      VALUES (${name}, ${email.toLowerCase()}, ${hash}, ${role}, true)
      RETURNING *
    `;
    res.status(201).json(safeUser(user));
  } catch (err) {
    console.error('create-admin error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
