const express = require('express');
const { sql } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/universities  — public (without agreement file data)
router.get('/', async (req, res) => {
  try {
    const unis = await sql`
      SELECT id, name, country, city, contact_name, contact_email, contact_phone,
             agreement_start, agreement_end, agreement_file_name, created_at
      FROM universities ORDER BY name
    `;
    res.json(unis);
  } catch (err) {
    console.error('universities list error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/universities/:id  — single university (without file data)
router.get('/:id', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [uni] = await sql`
      SELECT id, name, country, city, contact_name, contact_email, contact_phone,
             agreement_start, agreement_end, agreement_file_name, created_at
      FROM universities WHERE id = ${req.params.id}
    `;
    if (!uni) return res.status(404).json({ error: 'الجامعة غير موجودة' });
    res.json(uni);
  } catch (err) {
    console.error('university get error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/universities/:id/agreement  — download agreement file
router.get('/:id/agreement', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [uni] = await sql`
      SELECT agreement_file, agreement_file_name FROM universities WHERE id = ${req.params.id}
    `;
    if (!uni) return res.status(404).json({ error: 'الجامعة غير موجودة' });
    if (!uni.agreement_file) return res.status(404).json({ error: 'لا يوجد ملف اتفاقية لهذه الجامعة' });
    res.json({ file_name: uni.agreement_file_name, file_data: uni.agreement_file });
  } catch (err) {
    console.error('agreement download error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// POST /api/universities  — admin
router.post('/', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  const {
    name, country, city, contact_name, contact_email, contact_phone,
    agreement_start, agreement_end, agreement_file, agreement_file_name
  } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الجامعة مطلوب' });
  try {
    const [uni] = await sql`
      INSERT INTO universities
        (name, country, city, contact_name, contact_email, contact_phone,
         agreement_start, agreement_end, agreement_file, agreement_file_name)
      VALUES
        (${name}, ${country || null}, ${city || null}, ${contact_name || null},
         ${contact_email || null}, ${contact_phone || null},
         ${agreement_start || null}, ${agreement_end || null},
         ${agreement_file || null}, ${agreement_file_name || null})
      RETURNING id, name, country, city, contact_name, contact_email, contact_phone,
                agreement_start, agreement_end, agreement_file_name, created_at
    `;
    res.status(201).json(uni);
  } catch (err) {
    console.error('university create error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// PUT /api/universities/:id  — admin: full update
router.put('/:id', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  const {
    name, country, city, contact_name, contact_email, contact_phone,
    agreement_start, agreement_end, agreement_file, agreement_file_name
  } = req.body;
  try {
    // Build dynamic SET — only update agreement_file if a new one is provided
    const [uni] = agreement_file
      ? await sql`
          UPDATE universities SET
            name              = COALESCE(${name            || null}, name),
            country           = COALESCE(${country         || null}, country),
            city              = COALESCE(${city            || null}, city),
            contact_name      = COALESCE(${contact_name    || null}, contact_name),
            contact_email     = COALESCE(${contact_email   || null}, contact_email),
            contact_phone     = COALESCE(${contact_phone   || null}, contact_phone),
            agreement_start   = COALESCE(${agreement_start || null}, agreement_start),
            agreement_end     = COALESCE(${agreement_end   || null}, agreement_end),
            agreement_file      = ${agreement_file},
            agreement_file_name = ${agreement_file_name || null}
          WHERE id = ${req.params.id}
          RETURNING id, name, country, city, contact_name, contact_email, contact_phone,
                    agreement_start, agreement_end, agreement_file_name, created_at
        `
      : await sql`
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
          RETURNING id, name, country, city, contact_name, contact_email, contact_phone,
                    agreement_start, agreement_end, agreement_file_name, created_at
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
