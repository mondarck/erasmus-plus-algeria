const express = require('express');
const { sql } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// DELETE /api/admin/clear-applications  — superadmin only
router.delete('/clear-applications', authMiddleware, requireRole('superadmin'), async (req, res) => {
  try {
    const result = await sql`DELETE FROM applications RETURNING id`;
    res.json({ message: `تم حذف ${result.length} طلب بنجاح` });
  } catch (err) {
    console.error('clear applications error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// DELETE /api/admin/reset-all-data  — superadmin only
// Deletes applications, grants, universities in the correct order (FK constraints)
router.delete('/reset-all-data', authMiddleware, requireRole('superadmin'), async (req, res) => {
  try {
    const apps  = await sql`DELETE FROM applications RETURNING id`;
    const grants = await sql`DELETE FROM grants RETURNING id`;
    const unis  = await sql`DELETE FROM universities RETURNING id`;
    res.json({
      message: `تم مسح البيانات: ${apps.length} طلب، ${grants.length} منحة، ${unis.length} جامعة`
    });
  } catch (err) {
    console.error('reset all data error:', err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
