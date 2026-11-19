import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pcm_live.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'citizen' CHECK(role IN ('citizen', 'organizer', 'admin')),
      phone TEXT,
      city TEXT DEFAULT 'Pune',
      organization_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      admin_level TEXT NOT NULL DEFAULT 'moderator' CHECK(admin_level IN ('super_admin', 'moderator', 'verifier')),
      department_scope TEXT,
      can_approve_events INTEGER NOT NULL DEFAULT 1,
      can_verify_reports INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      jurisdiction TEXT NOT NULL DEFAULT 'Pune',
      contact_email TEXT,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS corruption_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_id TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      department_id INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN (
        'Bribery',
        'Misuse of public funds',
        'Administrative corruption',
        'Fraud',
        'Abuse of authority',
        'Other suspected corruption'
      )),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      general_location TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Pune',
      state TEXT NOT NULL DEFAULT 'Maharashtra',
      latitude REAL,
      longitude REAL,
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      is_confidential INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN (
        'Submitted',
        'Under Review',
        'Verified for Further Action',
        'Referred to Authority',
        'Action Recorded',
        'Closed'
      )),
      moderation_status TEXT NOT NULL DEFAULT 'Pending Moderation' CHECK(moderation_status IN (
        'Pending Moderation',
        'Approved for Public Hotspot',
        'Confidential - Restricted',
        'Correction Requested',
        'Rejected'
      )),
      verification_label TEXT NOT NULL DEFAULT 'Unverified Allegation - Under Review',
      source_attribution TEXT NOT NULL DEFAULT 'Citizen Allegation Report (Moderated)',
      potential_duplicate_of TEXT,
      admin_notes TEXT,
      is_public_hotspot INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS corruption_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      changed_by INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (report_id) REFERENCES corruption_reports(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_code TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      department_id INTEGER,
      category TEXT NOT NULL CHECK(category IN (
        'Road damage',
        'Water supply problems',
        'Garbage management',
        'Electricity problems',
        'Public infrastructure issues',
        'Sanitation',
        'Other civic issues'
      )),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location_text TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Pune',
      state TEXT NOT NULL DEFAULT 'Maharashtra',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN (
        'Submitted',
        'Under Review',
        'Assigned',
        'In Progress',
        'Resolved',
        'Rejected',
        'Closed'
      )),
      moderation_status TEXT NOT NULL DEFAULT 'Pending Moderation' CHECK(moderation_status IN (
        'Pending Moderation',
        'Approved Public',
        'Correction Requested',
        'Rejected'
      )),
      verification_label TEXT NOT NULL DEFAULT 'Pending Verification',
      source_attribution TEXT NOT NULL DEFAULT 'Citizen Civic Complaint',
      potential_duplicate_of TEXT,
      resolution_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS complaint_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      changed_by INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('corruption_report', 'complaint')),
      entity_id INTEGER NOT NULL,
      uploaded_by INTEGER,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      sha256_hash TEXT NOT NULL,
      is_private INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS external_event_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_name TEXT NOT NULL UNIQUE,
      source_url TEXT,
      license_type TEXT NOT NULL,
      attribution_text TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS protest_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_code TEXT NOT NULL UNIQUE,
      organizer_id INTEGER NOT NULL,
      external_source_id INTEGER,
      title TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN (
        'Civic Accountability',
        'Environmental Protection',
        'Infrastructure & Safety',
        'Public Budget & Transparency',
        'Labor & Community Rights',
        'Peaceful Vigil'
      )),
      description TEXT NOT NULL,
      public_location TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Pune',
      state TEXT NOT NULL DEFAULT 'Maharashtra',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      expected_participants INTEGER DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'Pending Moderation' CHECK(status IN (
        'Pending Moderation',
        'Scheduled',
        'Active',
        'Completed',
        'Correction Requested',
        'Cancelled',
        'Rejected'
      )),
      verification_label TEXT NOT NULL DEFAULT 'Pending Verification',
      source_attribution TEXT NOT NULL DEFAULT 'Organizer Public Submission',
      moderation_notes TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (external_source_id) REFERENCES external_event_sources(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS event_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      changed_by INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES protest_events(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS volunteers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role_preference TEXT NOT NULL DEFAULT 'General Support',
      availability_notes TEXT,
      status TEXT NOT NULL DEFAULT 'Registered' CHECK(status IN ('Registered', 'Confirmed', 'Cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(event_id, user_id),
      FOREIGN KEY (event_id) REFERENCES protest_events(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES protest_events(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN (
        'complaint_update',
        'corruption_update',
        'event_approval',
        'event_announcement',
        'volunteer_update',
        'system_notice'
      )),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_path TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_corruption_tracking ON corruption_reports(tracking_id);
    CREATE INDEX IF NOT EXISTS idx_corruption_status ON corruption_reports(status, moderation_status);
    CREATE INDEX IF NOT EXISTS idx_complaints_code ON complaints(complaint_code);
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status, moderation_status);
    CREATE INDEX IF NOT EXISTS idx_events_status ON protest_events(status, is_public);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);
}
