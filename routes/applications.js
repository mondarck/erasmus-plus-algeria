const express = require('express');
const { sql } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/applications  — student: submit application
router.post('/', authMiddleware, async (req, res) => {
  const { grant_id, motivation, experience, language_level, study_level } = req.body;

  if (!grant_id) return res.status(400).json({ error: 'يرجى اختيار المنحة' });

  try {
    // Check grant exists and is active
    const [grant] = await sql`SELECT id, status FROM grants WHERE id = ${grant_id}`;
    if (!grant) return res.status(404).json({ error: 'المنحة غير موجودة' });
    if (grant.status !== 'active') return res.status(400).json({ error: 'التقديم على هذه المنحة مغلق' });

    const [app] = await sql`
      INSERT INTO applications (user_id, grant_id, motivation, experience, language_level, study_level)
      VALUES (${req.user.id}, ${grant_id}, ${motivation || null}, ${experience || null}, ${language_level || null}, ${study_level || null})
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
             usr.faculty    AS student_faculty,
             usr.phone      AS student_phone
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

// POST /api/applications/:id/documents  — student: upload document (base64)
router.post('/:id/documents', authMiddleware, async (req, res) => {
  const { doc_type, file_name, file_size, file_data } = req.body;
  if (!doc_type || !file_name || !file_data) {
    return res.status(400).json({ error: 'بيانات الملف غير مكتملة' });
  }
  const VALID_TYPES = ['transcripts','language_cert','thesis_plan','supervisor_auth','invitation_letter'];
  if (!VALID_TYPES.includes(doc_type)) {
    return res.status(400).json({ error: 'نوع الوثيقة غير صالح' });
  }
  try {
    // Verify the application belongs to this user (or admin)
    const [app] = await sql`SELECT user_id FROM applications WHERE id = ${req.params.id}`;
    if (!app) return res.status(404).json({ error: 'الطلب غير موجود' });
    if (app.user_id !== req.user.id && !['admin','superadmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'غير مصرح' });
    }

    // Delete existing document of same type for this application (replace)
    await sql`DELETE FROM application_documents WHERE application_id = ${req.params.id} AND doc_type = ${doc_type}`;

    const [doc] = await sql`
      INSERT INTO application_documents (application_id, doc_type, file_name, file_size, file_data)
      VALUES (${req.params.id}, ${doc_type}, ${file_name}, ${file_size || null}, ${file_data})
      RETURNING id, doc_type, file_name, file_size, created_at
    `;
    res.status(201).json(doc);
  } catch (err) {
    console.error('document upload error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/applications/:id/documents  — list documents (without file_data)
router.get('/:id/documents', authMiddleware, async (req, res) => {
  try {
    const [app] = await sql`SELECT user_id FROM applications WHERE id = ${req.params.id}`;
    if (!app) return res.status(404).json({ error: 'الطلب غير موجود' });
    if (app.user_id !== req.user.id && !['admin','superadmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'غير مصرح' });
    }
    const docs = await sql`
      SELECT id, doc_type, file_name, file_size, created_at
      FROM application_documents
      WHERE application_id = ${req.params.id}
      ORDER BY created_at ASC
    `;
    res.json(docs);
  } catch (err) {
    console.error('documents list error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/applications/doc/:docId  — download single document (with file_data)
router.get('/doc/:docId', authMiddleware, async (req, res) => {
  try {
    const [doc] = await sql`
      SELECT d.*, a.user_id FROM application_documents d
      JOIN applications a ON d.application_id = a.id
      WHERE d.id = ${req.params.docId}
    `;
    if (!doc) return res.status(404).json({ error: 'الوثيقة غير موجودة' });
    if (doc.user_id !== req.user.id && !['admin','superadmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'غير مصرح' });
    }
    res.json({ file_name: doc.file_name, file_data: doc.file_data });
  } catch (err) {
    console.error('document download error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// PATCH /api/applications/:id/mobility  — admin: update mobility stage for accepted applicants
router.patch('/:id/mobility', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  const { mobility_stage } = req.body;
  const allowed = ['la_pending', 'la_approved', 'departed', 'abroad', 'returned', 'complete'];
  if (!allowed.includes(mobility_stage)) {
    return res.status(400).json({ error: 'مرحلة غير صالحة' });
  }
  try {
    const [app] = await sql`
      UPDATE applications
      SET mobility_stage = ${mobility_stage},
          updated_at     = NOW()
      WHERE id = ${req.params.id} AND status = 'accepted'
      RETURNING *
    `;
    if (!app) return res.status(404).json({ error: 'الطلب غير موجود أو غير مقبول' });
    res.json(app);
  } catch (err) {
    console.error('mobility update error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// GET /api/applications/my/documents-status  — student: which docs uploaded per application
router.get('/my/docs-status', authMiddleware, async (req, res) => {
  try {
    const docs = await sql`
      SELECT d.application_id, d.doc_type
      FROM application_documents d
      JOIN applications a ON d.application_id = a.id
      WHERE a.user_id = ${req.user.id}
    `;
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
