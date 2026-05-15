const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill in your Neon connection string.');
}

const sql = neon(process.env.DATABASE_URL);

/**
 * Run schema migrations on startup so the tables always exist.
 */
async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id                 SERIAL PRIMARY KEY,
      name               VARCHAR(255)  NOT NULL,
      phone              VARCHAR(50),
      email              VARCHAR(255)  UNIQUE NOT NULL,
      password_hash      VARCHAR(255)  NOT NULL,
      role               VARCHAR(50)   NOT NULL DEFAULT 'student'
                          CHECK (role IN ('student','admin','superadmin')),
      faculty            VARCHAR(255),
      applicant_type     VARCHAR(50)   DEFAULT 'master_student',
      is_active          BOOLEAN       NOT NULL DEFAULT false,
      preferred_language VARCHAR(10)   NOT NULL DEFAULT 'en',
      created_at         TIMESTAMPTZ   DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS universities (
      id              SERIAL PRIMARY KEY,
      name            VARCHAR(255) NOT NULL,
      country         VARCHAR(100),
      city            VARCHAR(100),
      contact_name    VARCHAR(255),
      contact_email   VARCHAR(255),
      contact_phone   VARCHAR(50),
      agreement_start DATE,
      agreement_end   DATE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS grants (
      id                SERIAL PRIMARY KEY,
      title             VARCHAR(255) NOT NULL,
      university_id     INTEGER REFERENCES universities(id) ON DELETE SET NULL,
      type              VARCHAR(50)  CHECK (type IN ('study','train','teach','staff')),
      positions         INTEGER      DEFAULT 0,
      deadline          DATE,
      application_start DATE,
      application_end   DATE,
      duration          VARCHAR(100),
      eligibility       TEXT,
      outgoing_students INTEGER DEFAULT 0,
      incoming_students INTEGER DEFAULT 0,
      outgoing_staff    INTEGER DEFAULT 0,
      incoming_staff    INTEGER DEFAULT 0,
      status            VARCHAR(50)  DEFAULT 'active'
                          CHECK (status IN ('active','closed','draft')),
      created_at        TIMESTAMPTZ  DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS applications (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER REFERENCES users(id)  ON DELETE CASCADE,
      grant_id       INTEGER REFERENCES grants(id) ON DELETE CASCADE,
      status         VARCHAR(50)  DEFAULT 'pending'
                       CHECK (status IN ('pending','review','accepted','rejected')),
      motivation     TEXT,
      experience     TEXT,
      language_level VARCHAR(10),
      study_level    VARCHAR(20)  DEFAULT NULL,
      admin_note     TEXT,
      created_at     TIMESTAMPTZ  DEFAULT NOW(),
      updated_at     TIMESTAMPTZ  DEFAULT NOW(),
      UNIQUE (user_id, grant_id)
    )
  `;

  // Migrations for existing tables
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS study_level      VARCHAR(20)`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS mobility_stage   VARCHAR(50)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active          BOOLEAN       NOT NULL DEFAULT false`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10)   NOT NULL DEFAULT 'en'`;

  await sql`UPDATE users SET is_active = true WHERE role IN ('admin','superadmin')`;
  await sql`UPDATE users SET is_active = true WHERE lower(email) LIKE '%@univ-eloued.dz'`;

  // Expand status CHECK to include reserve_list
  await sql`
    DO $$
    BEGIN
      ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
    EXCEPTION WHEN others THEN NULL;
    END $$
  `;
  await sql`
    ALTER TABLE applications
      ADD CONSTRAINT applications_status_check
      CHECK (status IN ('pending','review','accepted','rejected','reserve_list'))
  `.catch(() => null);

  // Extended mobility tracking fields (Stage 6: Visa, Stage 7-9: Travel & Completion)
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS workflow_stage         INTEGER DEFAULT 2`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS visa_appointment_date  DATE`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS embassy                VARCHAR(255)`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS visa_result            VARCHAR(50)`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS travel_date            DATE`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS arrival_confirmed      BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS departure_date         DATE`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS return_date            DATE`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS final_report_submitted BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS financially_closed     BOOLEAN DEFAULT false`;

  // Phase 2 — User profile extra fields
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS department     VARCHAR(255)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS speciality     VARCHAR(255)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS position_title VARCHAR(255)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS academic_year  VARCHAR(20)`;

  // Phase 2 — Application detailed fields
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS faculty               VARCHAR(255)`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS department            VARCHAR(255)`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS speciality            VARCHAR(255)`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS academic_year_detail  VARCHAR(50)`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS has_previous_erasmus  BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS has_invitation_letter BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS eligibility_confirmed BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS all_english_confirmed BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS professional_email    VARCHAR(255)`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS position_title        VARCHAR(255)`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS mobility_type         VARCHAR(50)`;
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS lecture_title         VARCHAR(500)`;

  await sql`ALTER TABLE universities  ADD COLUMN IF NOT EXISTS agreement_file       TEXT`;
  await sql`ALTER TABLE universities  ADD COLUMN IF NOT EXISTS agreement_file_name  VARCHAR(255)`;

  await sql`
    CREATE TABLE IF NOT EXISTS application_documents (
      id             SERIAL PRIMARY KEY,
      application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
      doc_type       VARCHAR(50)  NOT NULL,
      file_name      VARCHAR(255) NOT NULL,
      file_size      INTEGER,
      file_data      TEXT         NOT NULL,
      created_at     TIMESTAMPTZ  DEFAULT NOW()
    )
  `;

  console.log('✅ Database schema ready.');
}

module.exports = { sql, initSchema };
