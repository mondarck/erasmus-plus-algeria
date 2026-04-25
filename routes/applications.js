const express = require('express');
const { sql } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/applications  — student: submit application
router.post('/', authMiddleware, async (req, res) => {
  const { grant_id, motivation, experience, language_level } = req.body;

  if (!grant_id) return res.status(400).json({ error: 'يرجى اختيار المنحة' });

  try {
    // Check grant exists and is active
    const [grant] = await sql`SELECT id, status FROM grants WHERE id = ${grant_id}`;
    if (!grant) return res.status(404).json({ error: 'المنحة غير موجودة' });
    if (grant.status !== 'active') return res.status(400).json({ error: 'التقديم على هذه المنحة مغلق' });

    const [app] = await sql`
      INSERT INTO applications (user_id, grant_id, motivation, experience, language_level)
      VALUES (${req.user.id}, ${grant_id}, ${motivation || null}, ${experience || null}, ${language_level || null})
      RETURNING *
    `;
    res.status(201).json(app);
  } catch (err) {
    if (err.message && err.message.includes('unique')) {
      return res.status(409).json({ error: 'لقد قدمت على هذه المنحة مسبقاً' });
    }
    console.error('application submit error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/applications/my  — student: own applications
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const apps = await sql`
      SELECT a.*,
             g.title        AS grant_title,
             g.type         AS grant_type,
             g.duration     AS grant_duration,
             u.name         AS university_name,
             u.country      AS university_country
      FROM   applications a
      JOIN   grants g       ON a.grant_id = g.id
      LEFT JOIN universities u ON g.university_id = u.id
      WHERE  a.user_id = ${req.user.id}
      ORDER  BY a.created_at DESC
    `;
    res.json(apps);
  } catch (err) {
    console.error('my applications error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/applications/all  — admin: all applications
router.get('/all', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const apps = await sql`
      SELECT a.*,
             g.title        AS grant_title,
             u2.name        AS university_name,
             usr.name       AS student_name,
             usr.email      AS student_email,
             usr.faculty    AS student_faculty
      FROM   applications a
      JOIN   grants g        ON a.grant_id  = g.id
      JOIN   users  usr      ON a.user_id   = usr.id
      LEFT JOIN universities u2 ON g.university_id = u2.id
      ORDER  BY a.created_at DESC
    `;
    res.json(apps);
  } catch (err) {
    console.error('all applications error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// PATCH /api/applications/:id/status  — admin: update status + optional note
router.patch('/:id/status', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  const { status, admin_note } = req.body;
  const allowed = ['pending', 'review', 'accepted', 'rejected'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'حالة غير صالحة' });
  }
  try {
    const [app] = await sql`
      UPDATE applications
      SET status     = ${status},
          admin_note = COALESCE(${admin_note || null}, admin_note),
          updated_at = NOW()
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!app) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json(app);
  } catch (err) {
    console.error('status update error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/applications/stats  — admin: summary counts
router.get('/stats', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [row] = await sql`
      SELECT
        COUNT(*)                                    AS total,
        COUNT(*) FILTER (WHERE status='pending')    AS pending,
        COUNT(*) FILTER (WHERE status='review')     AS review,
        COUNT(*) FILTER (WHERE status='accepted')   AS accepted,
        COUNT(*) FILTER (WHERE status='rejected')   AS rejected
      FROM applications
    `;
    res.json(row);
  } catch (err) {
    console.error('stats error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
