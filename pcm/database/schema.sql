-- ============================================================================
-- PROTEST & CORRUPTION MANAGER (PCM) — MySQL 8.0 Relational Schema
-- ============================================================================

CREATE DATABASE IF NOT EXISTS pcm_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pcm_db;

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('citizen', 'organizer', 'admin') NOT NULL DEFAULT 'citizen',
  phone VARCHAR(30) NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Pune',
  organization_name VARCHAR(200) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  reset_token_hash VARCHAR(255) NULL,
  reset_token_expires_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role, is_active),
  INDEX idx_users_city (city)
) ENGINE=InnoDB;

-- 2. admins
CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  admin_level ENUM('super_admin', 'moderator', 'verifier') NOT NULL DEFAULT 'moderator',
  department_scope VARCHAR(150) NULL,
  can_approve_events TINYINT(1) NOT NULL DEFAULT 1,
  can_verify_reports TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_admins_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. departments
CREATE TABLE IF NOT EXISTS departments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL UNIQUE,
  code VARCHAR(40) NOT NULL UNIQUE,
  jurisdiction VARCHAR(150) NOT NULL DEFAULT 'Pune Municipal Corporation',
  contact_email VARCHAR(255) NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 4. corruption_reports
CREATE TABLE IF NOT EXISTS corruption_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tracking_id VARCHAR(40) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NULL,
  department_id BIGINT UNSIGNED NOT NULL,
  category ENUM(
    'Bribery',
    'Misuse of public funds',
    'Administrative corruption',
    'Fraud',
    'Abuse of authority',
    'Other suspected corruption'
  ) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  general_location VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Pune',
  state VARCHAR(100) NOT NULL DEFAULT 'Maharashtra',
  latitude DECIMAL(8, 2) NULL COMMENT 'Generalized ~1.1km precision for privacy',
  longitude DECIMAL(8, 2) NULL COMMENT 'Generalized ~1.1km precision for privacy',
  is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
  is_confidential TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM(
    'Submitted',
    'Under Review',
    'Verified for Further Action',
    'Referred to Authority',
    'Action Recorded',
    'Closed'
  ) NOT NULL DEFAULT 'Submitted',
  moderation_status ENUM(
    'Pending Moderation',
    'Approved for Public Hotspot',
    'Confidential - Restricted',
    'Correction Requested',
    'Rejected'
  ) NOT NULL DEFAULT 'Pending Moderation',
  verification_label VARCHAR(180) NOT NULL DEFAULT 'Unverified Allegation - Under Review',
  source_attribution VARCHAR(180) NOT NULL DEFAULT 'Citizen Allegation Report (Moderated)',
  potential_duplicate_of VARCHAR(40) NULL,
  admin_notes TEXT NULL,
  is_public_hotspot TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cr_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  INDEX idx_cr_status (status, moderation_status),
  INDEX idx_cr_public (is_public_hotspot, is_confidential),
  INDEX idx_cr_city (city)
) ENGINE=InnoDB;

-- 5. complaints
CREATE TABLE IF NOT EXISTS complaints (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  complaint_code VARCHAR(40) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NULL,
  department_id BIGINT UNSIGNED NULL,
  category ENUM(
    'Road damage',
    'Water supply problems',
    'Garbage management',
    'Electricity problems',
    'Public infrastructure issues',
    'Sanitation',
    'Other civic issues'
  ) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  location_text VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Pune',
  state VARCHAR(100) NOT NULL DEFAULT 'Maharashtra',
  latitude DECIMAL(9, 6) NOT NULL,
  longitude DECIMAL(9, 6) NOT NULL,
  status ENUM(
    'Submitted',
    'Under Review',
    'Assigned',
    'In Progress',
    'Resolved',
    'Rejected',
    'Closed'
  ) NOT NULL DEFAULT 'Submitted',
  moderation_status ENUM(
    'Pending Moderation',
    'Approved Public',
    'Correction Requested',
    'Rejected'
  ) NOT NULL DEFAULT 'Pending Moderation',
  verification_label VARCHAR(180) NOT NULL DEFAULT 'Pending Verification',
  source_attribution VARCHAR(180) NOT NULL DEFAULT 'Citizen Civic Complaint',
  potential_duplicate_of VARCHAR(40) NULL,
  resolution_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cmp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cmp_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_cmp_status (status, moderation_status),
  INDEX idx_cmp_category (category),
  INDEX idx_cmp_city (city)
) ENGINE=InnoDB;

-- 6. evidence
CREATE TABLE IF NOT EXISTS evidence (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity_type ENUM('corruption_report', 'complaint') NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  sha256_hash CHAR(64) NOT NULL,
  is_private TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ev_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ev_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- 7. complaint_status_history
CREATE TABLE IF NOT EXISTS complaint_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  complaint_id BIGINT UNSIGNED NOT NULL,
  previous_status VARCHAR(60) NULL,
  new_status VARCHAR(60) NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_csh_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  CONSTRAINT fk_csh_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_csh_complaint (complaint_id)
) ENGINE=InnoDB;

-- 8. external_event_sources
CREATE TABLE IF NOT EXISTS external_event_sources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_name VARCHAR(180) NOT NULL UNIQUE,
  source_url VARCHAR(500) NULL,
  license_type VARCHAR(150) NOT NULL,
  attribution_text VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 9. protest_events
CREATE TABLE IF NOT EXISTS protest_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_code VARCHAR(40) NOT NULL UNIQUE,
  organizer_id BIGINT UNSIGNED NOT NULL,
  external_source_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  category ENUM(
    'Civic Accountability',
    'Environmental Protection',
    'Infrastructure & Safety',
    'Public Budget & Transparency',
    'Labor & Community Rights',
    'Peaceful Vigil'
  ) NOT NULL,
  description TEXT NOT NULL,
  public_location VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Pune',
  state VARCHAR(100) NOT NULL DEFAULT 'Maharashtra',
  latitude DECIMAL(9, 6) NOT NULL,
  longitude DECIMAL(9, 6) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  expected_participants INT UNSIGNED NOT NULL DEFAULT 50,
  status ENUM(
    'Pending Moderation',
    'Scheduled',
    'Active',
    'Completed',
    'Correction Requested',
    'Cancelled',
    'Rejected'
  ) NOT NULL DEFAULT 'Pending Moderation',
  verification_label VARCHAR(180) NOT NULL DEFAULT 'Pending Moderator Review',
  source_attribution VARCHAR(180) NOT NULL DEFAULT 'Organizer Public Submission',
  moderation_notes TEXT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pe_org FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pe_ext FOREIGN KEY (external_source_id) REFERENCES external_event_sources(id) ON DELETE SET NULL,
  INDEX idx_pe_public (is_public, status),
  INDEX idx_pe_city_time (city, start_time)
) ENGINE=InnoDB;

-- 10. volunteers
CREATE TABLE IF NOT EXISTS volunteers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role_preference VARCHAR(120) NOT NULL DEFAULT 'General Support',
  availability_notes VARCHAR(255) NULL,
  status ENUM('Registered', 'Confirmed', 'Cancelled') NOT NULL DEFAULT 'Registered',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_volunteer_event_user (event_id, user_id),
  CONSTRAINT fk_vol_event FOREIGN KEY (event_id) REFERENCES protest_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_vol_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 11. announcements
CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ann_event FOREIGN KEY (event_id) REFERENCES protest_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_ann_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 12. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM(
    'complaint_update',
    'corruption_update',
    'event_approval',
    'event_announcement',
    'volunteer_update',
    'system_notice'
  ) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  link_path VARCHAR(120) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user_read (user_id, is_read)
) ENGINE=InnoDB;

-- 13. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED NULL,
  actor_role VARCHAR(40) NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  details TEXT NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_action (action, created_at)
) ENGINE=InnoDB;

-- 14. event_status_history
CREATE TABLE IF NOT EXISTS event_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  previous_status VARCHAR(60) NULL,
  new_status VARCHAR(60) NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_esh_event FOREIGN KEY (event_id) REFERENCES protest_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_esh_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_esh_event (event_id)
) ENGINE=InnoDB;
