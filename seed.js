/**
 * seed.js — populates the database with demo accounts, universities, and grants.
 * Run once:  node seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql, initSchema } = require('./db');

async function seed() {
  await initSchema();

  // ── Demo users ─────────────────────────────────────────────────────────────
  const users = [
    { name: 'محمد أحمد',     phone: '+213770123456', email: 'student@demo.dz',    password: 'password123', role: 'student',    faculty: 'كلية العلوم',    applicant_type: 'طالب' },
    { name: 'د. أمين بلقاسم', phone: '+213550987654', email: 'admin@demo.dz',      password: 'password123', role: 'admin',      faculty: null,             applicant_type: 'أستاذ' },
    { name: 'مدير النظام',    phone: '+213661234567', email: 'superadmin@demo.dz', password: 'password123', role: 'superadmin', faculty: null,             applicant_type: null },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    await sql`
      INSERT INTO users (name, phone, email, password_hash, role, faculty, applicant_type)
      VALUES (${u.name}, ${u.phone}, ${u.email}, ${hash}, ${u.role}, ${u.faculty}, ${u.applicant_type})
      ON CONFLICT (email) DO NOTHING
    `;
  }
  console.log('✅ Demo users seeded (emails: student@demo.dz / admin@demo.dz / superadmin@demo.dz, password: password123)');

  // ── Partner universities ───────────────────────────────────────────────────
  const unis = [
    { name: 'Universitat de Barcelona', country: '🇪🇸 إسبانيا', city: 'برشلونة', contact_name: 'Prof. Garcia', contact_email: 'erasmus@ub.edu', agreement_start: '2023-09-01', agreement_end: '2026-08-31' },
    { name: 'Sapienza University of Rome', country: '🇮🇹 إيطاليا', city: 'روما', contact_name: 'Prof. Rossi', contact_email: 'intl@uniroma1.it', agreement_start: '2023-09-01', agreement_end: '2026-08-31' },
    { name: 'Université Paris-Saclay', country: '🇫🇷 فرنسا', city: 'باريس', contact_name: 'Prof. Dupont', contact_email: 'erasmus@universite-paris-saclay.fr', agreement_start: '2024-01-01', agreement_end: '2027-12-31' },
    { name: 'TU Munich', country: '🇩🇪 ألمانيا', city: 'ميونخ', contact_name: 'Prof. Müller', contact_email: 'international@tum.de', agreement_start: '2023-09-01', agreement_end: '2026-08-31' },
    { name: 'Universidad Complutense de Madrid', country: '🇪🇸 إسبانيا', city: 'مدريد', contact_name: 'Prof. López', contact_email: 'relaciones.internacionales@ucm.es', agreement_start: '2024-01-01', agreement_end: '2027-12-31' },
    { name: 'FU Berlin', country: '🇩🇪 ألمانيا', city: 'برلين', contact_name: 'Prof. Schreiber', contact_email: 'international@fu-berlin.de', agreement_start: '2023-09-01', agreement_end: '2025-08-31' },
  ];

  const uniIds = {};
  for (const u of unis) {
    const [row] = await sql`
      INSERT INTO universities (name, country, city, contact_name, contact_email, agreement_start, agreement_end)
      VALUES (${u.name}, ${u.country}, ${u.city}, ${u.contact_name}, ${u.contact_email}, ${u.agreement_start}, ${u.agreement_end})
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `;
    if (row) uniIds[u.name] = row.id;
  }
  console.log('✅ Universities seeded');

  // ── Grants ────────────────────────────────────────────────────────────────
  const grantDefs = [
    { title: 'Erasmus+ دراسة — برشلونة', uni: 'Universitat de Barcelona', type: 'study', positions: 5, deadline: '2025-04-30', duration: 'فصل دراسي (5 أشهر)', eligibility: 'معدل لا يقل عن 12/20، إجادة اللغة الإنجليزية B2' },
    { title: 'Erasmus+ تدريب — روما', uni: 'Sapienza University of Rome', type: 'train', positions: 3, deadline: '2025-05-15', duration: 'شهران', eligibility: 'طالب سنة ثالثة فأكثر' },
    { title: 'Erasmus+ دراسة — باريس', uni: 'Université Paris-Saclay', type: 'study', positions: 4, deadline: '2025-05-01', duration: 'سنة كاملة', eligibility: 'معدل لا يقل عن 13/20، إجادة الفرنسية B2' },
    { title: 'Erasmus+ تدريس — ميونخ', uni: 'TU Munich', type: 'teach', positions: 2, deadline: '2025-04-20', duration: 'أسبوعان', eligibility: 'أستاذ دائم بخبرة 2 سنوات على الأقل' },
    { title: 'Erasmus+ دراسة — مدريد', uni: 'Universidad Complutense de Madrid', type: 'study', positions: 6, deadline: '2025-05-10', duration: 'فصل دراسي', eligibility: 'معدل لا يقل عن 12/20' },
    { title: 'Erasmus+ تدريب — برلين', uni: 'FU Berlin', type: 'train', positions: 2, deadline: '2025-04-25', duration: 'شهر واحد', eligibility: 'طالب أو خريج حديث (أقل من سنة)' },
  ];

  for (const g of grantDefs) {
    // Try to find university id from the seeded rows; fall back to null
    const uniId = uniIds[g.uni] || null;
    await sql`
      INSERT INTO grants (title, university_id, type, positions, deadline, duration, eligibility, status)
      VALUES (${g.title}, ${uniId}, ${g.type}, ${g.positions}, ${g.deadline}, ${g.duration}, ${g.eligibility}, 'active')
      ON CONFLICT DO NOTHING
    `;
  }
  console.log('✅ Grants seeded');

  console.log('\n🎉 Seeding complete! Demo credentials:');
  console.log('   student@demo.dz    / password123  → Student dashboard');
  console.log('   admin@demo.dz      / password123  → Admin dashboard');
  console.log('   superadmin@demo.dz / password123  → Superadmin dashboard');
  process.exit(0);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
