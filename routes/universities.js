const express = require('express');
const { sql } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/universities  — public
router.get('/', async (req, res) => {
  try {
    const unis = await sql`SELECT * FROM universities ORDER BY name`;
    res.json(unis);
  } catch (err) {
    console.error('universities list error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// POST /api/universities  — admin
router.post('/', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  const { name, country, city, contact_name, contact_email, contact_phone, agreement_start, agreement_end } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الجامعة مطلوب' });
  try {
    const [uni] = await sql`
      INSERT INTO universities (name, country, city, contact_name, contact_email, contact_phone, agreement_start, agreement_end)
      VALUES (${name}, ${country || null}, ${city || null}, ${contact_name || null},
              ${contact_email || null}, ${contact_phone || null},
              ${agreement_start || null}, ${agreement_end || null})
      RETURNING *
    `;
    res.status(201).json(uni);
  } catch (err) {
    console.error('university create error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// PUT /api/universities/:id  — admin
router.put('/:id', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  const { name, country, city, contact_name, contact_email, contact_phone, agreement_start, agreement_end } = req.body;
  try {
    const [uni] = await sql`
      UPDATE universities SET
        name            = COALESCE(${name            || null}, name),
        country         = COALESCE(${country         || null}, country),
        city            = COALESCE(${city            || null}, city),
        contact_name    = COALESCE(${contact_name    || null}, contact_name),
        contact_email   = COALESCE(${contact_email   || null}, contact_email),
        contact_phone   = COALESCE(${contact_phone   || null}, contact_phone),
        agreement_start = COALESCE(${agreement_start || null}, agreement_start),
        agreement_end   = COALESCE(${agreement_end   || null}, agreement_end)
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!uni) return res.status(404).json({ error: 'الجامعة غير موجودة' });
    res.json(uni);
  } catch (err) {
    console.error('university update error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// DELETE /api/universities/:id  — admin + superadmin
router.delete('/:id', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    await sql`DELETE FROM universities WHERE id = ${req.params.id}`;
    res.json({ message: 'تم حذف الجامعة بنجاح' });
  } catch (err) {
    console.error('university delete error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
