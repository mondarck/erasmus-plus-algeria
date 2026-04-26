const express = require('express');
const { sql } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/grants  — public: all active grants with university info + stats
router.get('/', async (req, res) => {
  try {
    const grants = await sql`
      SELECT g.*, u.name AS university_name, u.country, u.city,
             COUNT(a.id)                                        AS applications_count,
             COUNT(a.id) FILTER (WHERE a.status = 'accepted')  AS accepted_count,
             GREATEST(0, g.positions - COUNT(a.id) FILTER (WHERE a.status = 'accepted')) AS positions_remaining
      FROM   grants g
      LEFT JOIN universities u  ON g.university_id = u.id
      LEFT JOIN applications  a ON a.grant_id = g.id
      WHERE  g.status = 'active'
      GROUP BY g.id, u.name, u.country, u.city
      ORDER  BY g.created_at DESC
    `;
    res.json(grants);
  } catch (err) {
    console.error('grants list error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/grants/all  — admin: all grants regardless of status, with stats
router.get('/all', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const grants = await sql`
      SELECT g.*, u.name AS university_name, u.country,
             COUNT(a.id)                                        AS applications_count,
             COUNT(a.id) FILTER (WHERE a.status = 'accepted')  AS accepted_count,
             GREATEST(0, g.positions - COUNT(a.id) FILTER (WHERE a.status = 'accepted')) AS positions_remaining
      FROM   grants g
      LEFT JOIN universities u  ON g.university_id = u.id
      LEFT JOIN applications  a ON a.grant_id = g.id
      GROUP BY g.id, u.name, u.country
      ORDER  BY g.created_at DESC
    `;
    res.json(grants);
  } catch (err) {
    console.error('grants all error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/grants/:id  — single grant detail
router.get('/:id', async (req, res) => {
  try {
    const [grant] = await sql`
      SELECT g.*, u.name AS university_name, u.country, u.city,
             u.contact_name, u.contact_email
      FROM   grants g
      LEFT JOIN universities u ON g.university_id = u.id
      WHERE  g.id = ${req.params.id}
    `;
    if (!grant) return res.status(404).json({ error: 'المنحة غير موجودة' });
    res.json(grant);
  } catch (err) {
    console.error('grant detail error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// POST /api/grants  — admin: create grant
router.post('/', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  const {
    title, university_id, type, positions, deadline,
    application_start, application_end, duration, eligibility,
    outgoing_students, incoming_students, outgoing_staff, incoming_staff,
    status = 'active'
  } = req.body;

  if (!title) return res.status(400).json({ error: 'عنوان المنحة مطلوب' });

  try {
    const [grant] = await sql`
      INSERT INTO grants
        (title, university_id, type, positions, deadline, application_start, application_end,
         duration, eligibility, outgoing_students, incoming_students, outgoing_staff, incoming_staff, status)
      VALUES
        (${title}, ${university_id || null}, ${type || 'study'}, ${positions || 0},
         ${deadline || null}, ${application_start || null}, ${application_end || null},
         ${duration || null}, ${eligibility || null},
         ${outgoing_students || 0}, ${incoming_students || 0},
         ${outgoing_staff || 0},   ${incoming_staff || 0},
         ${status})
      RETURNING *
    `;
    res.status(201).json(grant);
  } catch (err) {
    console.error('grant create error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// PUT /api/grants/:id  — admin: update grant
router.put('/:id', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  const {
    title, university_id, type, positions, deadline,
    duration, eligibility, status
  } = req.body;

  try {
    const [grant] = await sql`
      UPDATE grants SET
        title         = COALESCE(${title         || null}, title),
        university_id = COALESCE(${university_id || null}, university_id),
        type          = COALESCE(${type          || null}, type),
        positions     = COALESCE(${positions     ?? null}, positions),
        deadline      = COALESCE(${deadline      || null}, deadline),
        duration      = COALESCE(${duration      || null}, duration),
        eligibility   = COALESCE(${eligibility   || null}, eligibility),
        status        = COALESCE(${status        || null}, status)
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!grant) return res.status(404).json({ error: 'المنحة غير موجودة' });
    res.json(grant);
  } catch (err) {
    console.error('grant update error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// DELETE /api/grants/:id  — admin: delete grant
router.delete('/:id', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    await sql`DELETE FROM grants WHERE id = ${req.params.id}`;
    res.json({ message: 'تم حذف المنحة بنجاح' });
  } catch (err) {
    console.error('grant delete error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
