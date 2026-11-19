import { db } from './db.ts';
import { hashPassword } from './security.ts';

export function seedDatabaseIfEmpty(): void {
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount > 0) {
    return;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role, phone, city, organization_name, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const adminPass = hashPassword('Admin@PCM2026!');
  const organizerPass = hashPassword('Organizer@PCM2026!');
  const citizenPass = hashPassword('Citizen@PCM2026!');

  const adminId = Number(
    insertUser.run(
      'Dr. Meera Deshmukh',
      'admin@pcm-civic.org',
      adminPass,
      'admin',
      '+91-20-25501001',
      'Pune',
      'PCM Independent Oversight Board'
    ).lastInsertRowid
  );

  const organizerId = Number(
    insertUser.run(
      'Rohan Kulkarni',
      'organizer@pcm-civic.org',
      organizerPass,
      'organizer',
      '+91-20-25501042',
      'Pune',
      'Pune Civic Transparency Collective'
    ).lastInsertRowid
  );

  const citizenId = Number(
    insertUser.run(
      'Ananya Joshi',
      'citizen@pcm-civic.org',
      citizenPass,
      'citizen',
      '+91-20-25501089',
      'Pune',
      null
    ).lastInsertRowid
  );

  const citizen2Id = Number(
    insertUser.run(
      'Vikram Patil',
      'vikram.patil@example.org',
      citizenPass,
      'citizen',
      '+91-20-25501112',
      'Pune',
      null
    ).lastInsertRowid
  );

  db.prepare(
    `INSERT INTO admins (user_id, admin_level, department_scope, can_approve_events, can_verify_reports)
     VALUES (?, 'super_admin', 'All Departments', 1, 1)`
  ).run(adminId);

  const insertDept = db.prepare(`
    INSERT INTO departments (name, code, jurisdiction, contact_email, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  const deptRoads = Number(
    insertDept.run(
      'PMC Road & Traffic Engineering',
      'PMC-ROADS',
      'Pune Municipal Corporation',
      'roads@pmc-civic.example',
      'Road resurfacing, footpath maintenance, streetlight safety, and urban traffic corridors.'
    ).lastInsertRowid
  );
  const deptWater = Number(
    insertDept.run(
      'PMC Water Supply & Drainage',
      'PMC-WATER',
      'Pune Municipal Corporation',
      'water@pmc-civic.example',
      'Equitable municipal water distribution, pipeline maintenance, and stormwater drainage.'
    ).lastInsertRowid
  );
  const deptWaste = Number(
    insertDept.run(
      'Pune Solid Waste & Sanitation',
      'PMC-SWM',
      'Pune Municipal Corporation',
      'sanitation@pmc-civic.example',
      'Door-to-door waste collection, material recovery centers, and public sanitation.'
    ).lastInsertRowid
  );
  const deptPower = Number(
    insertDept.run(
      'Maharashtra Electricity Distribution (MSEDCL)',
      'MSEDCL-PN',
      'Maharashtra State',
      'grid@msedcl-civic.example',
      'Transformer maintenance, outage resolution, and feeder reliability.'
    ).lastInsertRowid
  );
  const deptAcb = Number(
    insertDept.run(
      'Public Procurement & Works Audit',
      'PROC-AUDIT',
      'Maharashtra State',
      'audit@transparency-civic.example',
      'Tender compliance, municipal contractor billing verification, and public works audits.'
    ).lastInsertRowid
  );
  const deptPermits = Number(
    insertDept.run(
      'Civic Licensing & Building Approvals',
      'CIVIC-LIC',
      'Pune Municipal Corporation',
      'permits@pmc-civic.example',
      'Building plan approvals, trade licenses, and civic compliance inspections.'
    ).lastInsertRowid
  );

  // External permitted public data source
  const extSourceId = Number(
    db
      .prepare(
        `INSERT INTO external_event_sources (source_name, source_url, license_type, attribution_text)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        'Pune Open Civic Data Portal',
        'https://opendata.pmc.gov.in',
        'Open Government Data License - India',
        'Public civic assembly & municipal townhall registry (Open Civic Data)'
      ).lastInsertRowid
  );

  // Seed Corruption Reports (allegations with generalized ~1.1km coordinates)
  const insertReport = db.prepare(`
    INSERT INTO corruption_reports (
      tracking_id, user_id, department_id, category, title, description,
      general_location, city, state, latitude, longitude,
      is_anonymous, is_confidential, status, moderation_status,
      verification_label, source_attribution, is_public_hotspot, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))
  `);

  const insertReportHistory = db.prepare(`
    INSERT INTO corruption_status_history (report_id, previous_status, new_status, changed_by, note, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))
  `);

  const r1 = Number(
    insertReport.run(
      'PCM-CR-2026-1041',
      citizenId,
      deptAcb,
      'Misuse of public funds',
      'Alleged Irregular Billing in Ward 14 Footpath Resurfacing Tender',
      'Citizen submission alleging substandard paver blocks used compared to published municipal tender BOQ specifications along Karve Road corridor. Details submitted with photo timestamps for independent audit.',
      'Karve Road Sector, Kothrud, Pune',
      'Pune',
      'Maharashtra',
      18.51,
      73.81,
      0,
      0,
      'Verified for Further Action',
      'Approved for Public Hotspot',
      'Verified Report Details (Allegation Under Authority Review)',
      'Citizen Allegation Report (Moderated)',
      1,
      '-18 days',
      '-3 days'
    ).lastInsertRowid
  );
  insertReportHistory.run(r1, null, 'Submitted', citizenId, 'Report submitted with tender reference.', '-18 days');
  insertReportHistory.run(r1, 'Submitted', 'Under Review', adminId, 'Preliminary document completeness verified.', '-12 days');
  insertReportHistory.run(r1, 'Under Review', 'Verified for Further Action', adminId, 'Report metadata verified; generalized ward hotspot published.', '-3 days');

  const r2 = Number(
    insertReport.run(
      'PCM-CR-2026-1042',
      null,
      deptPermits,
      'Bribery',
      'Alleged Informal Fee Demand for Commercial Occupancy Clearance',
      'Anonymous whistleblower report alleging irregular facilitation payments requested during occupancy inspection in Shivajinagar commercial zone. Identity fully detached.',
      'Shivajinagar Central Zone, Pune',
      'Pune',
      'Maharashtra',
      18.53,
      73.85,
      1,
      0,
      'Referred to Authority',
      'Approved for Public Hotspot',
      'Referred to Oversight Authority (Unproven Allegation)',
      'Anonymous Citizen Allegation (Moderated)',
      1,
      '-25 days',
      '-5 days'
    ).lastInsertRowid
  );
  insertReportHistory.run(r2, null, 'Submitted', null, 'Anonymous report logged securely.', '-25 days');
  insertReportHistory.run(r2, 'Submitted', 'Under Review', adminId, 'Reviewed for non-defamatory compliance.', '-20 days');
  insertReportHistory.run(r2, 'Under Review', 'Verified for Further Action', adminId, 'Corroborating receipt pattern flagged.', '-10 days');
  insertReportHistory.run(r2, 'Verified for Further Action', 'Referred to Authority', adminId, 'Forwarded to vigilance unit.', '-5 days');

  const r3 = Number(
    insertReport.run(
      'PCM-CR-2026-1043',
      null,
      deptWater,
      'Administrative corruption',
      'Alleged Preferential Water Tanker Allocation During Peak Shortage',
      'Multiple residents allege municipal emergency water tankers were diverted from scheduled residential clusters to private commercial sites.',
      'Hadapsar Industrial Corridor, Pune',
      'Pune',
      'Maharashtra',
      18.50,
      73.93,
      1,
      0,
      'Under Review',
      'Approved for Public Hotspot',
      'Verified Report Details (Allegation Under Review)',
      'Anonymous Citizen Allegation (Moderated)',
      1,
      '-9 days',
      '-2 days'
    ).lastInsertRowid
  );
  insertReportHistory.run(r3, null, 'Submitted', null, 'Anonymous submission received.', '-9 days');
  insertReportHistory.run(r3, 'Submitted', 'Under Review', adminId, 'Assigned for schedule log cross-check.', '-2 days');

  const r4 = Number(
    insertReport.run(
      'PCM-CR-2026-1044',
      citizen2Id,
      deptAcb,
      'Fraud',
      'Alleged Duplicate Desilting Invoices Prior to Monsoon',
      'Report alleging overlapping stormwater drain desilting claims across adjoining wards with unverified completion logs.',
      'Baner-Balewadi Cluster, Pune',
      'Pune',
      'Maharashtra',
      18.56,
      73.78,
      0,
      0,
      'Action Recorded',
      'Approved for Public Hotspot',
      'Authority Action Recorded',
      'Citizen Allegation Report (Moderated)',
      1,
      '-42 days',
      '-4 days'
    ).lastInsertRowid
  );
  insertReportHistory.run(r4, null, 'Submitted', citizen2Id, 'Submitted initial invoice discrepancy notes.', '-42 days');
  insertReportHistory.run(r4, 'Submitted', 'Referred to Authority', adminId, 'Referred to municipal audit office.', '-21 days');
  insertReportHistory.run(r4, 'Referred to Authority', 'Action Recorded', adminId, 'Audit office issued payment hold pending physical verification.', '-4 days');

  const r5 = Number(
    insertReport.run(
      'PCM-CR-2026-1045',
      null,
      deptRoads,
      'Misuse of public funds',
      'Alleged Phantom Streetlight Maintenance Billing in Hadapsar',
      'Anonymous report alleging maintenance invoices cleared for LED poles that remain non-functional for over 4 months.',
      'Hadapsar Ward Cluster, Pune',
      'Pune',
      'Maharashtra',
      18.50,
      73.93,
      1,
      0,
      'Submitted',
      'Pending Moderation',
      'Unverified Allegation - Pending Moderation',
      'Anonymous Citizen Allegation',
      0,
      '-1 days',
      '-1 days'
    ).lastInsertRowid
  );
  insertReportHistory.run(r5, null, 'Submitted', null, 'Awaiting moderator review.', '-1 days');

  // Seed a Mumbai & Bengaluru hotspot for India-wide aggregated map
  const r6 = Number(
    insertReport.run(
      'PCM-CR-2026-1046',
      null,
      deptAcb,
      'Abuse of authority',
      'Alleged Arbitrary Vendor Eviction Without Municipal Notice',
      'Anonymous allegation of unauthorized confiscation without statutory receipt in Central Market zone.',
      'Dadar Civic Zone, Mumbai',
      'Mumbai',
      'Maharashtra',
      19.02,
      72.84,
      1,
      0,
      'Verified for Further Action',
      'Approved for Public Hotspot',
      'Verified Report Details (Allegation Under Review)',
      'Anonymous Citizen Allegation (Moderated)',
      1,
      '-14 days',
      '-6 days'
    ).lastInsertRowid
  );
  insertReportHistory.run(r6, null, 'Submitted', null, 'Submitted anonymously.', '-14 days');
  insertReportHistory.run(r6, 'Submitted', 'Verified for Further Action', adminId, 'Approved generalized hotspot.', '-6 days');

  // Seed Confidential Report (NEVER exposed publicly)
  const r7 = Number(
    insertReport.run(
      'PCM-CR-2026-1047',
      citizenId,
      deptPermits,
      'Bribery',
      'Confidential Whistleblower Filing — Procurement Committee Pressure',
      'Strictly confidential allegation regarding internal tender evaluation committee pressure. Restricted to authorized oversight admins.',
      'Pune Central Zone',
      'Pune',
      'Maharashtra',
      18.52,
      73.86,
      0,
      1,
      'Under Review',
      'Confidential - Restricted',
      'Restricted Confidential Filing',
      'Confidential Citizen Filing',
      0,
      '-5 days',
      '-1 days'
    ).lastInsertRowid
  );
  insertReportHistory.run(r7, null, 'Submitted', citizenId, 'Confidential filing encrypted in restricted queue.', '-5 days');

  // Seed Civic Complaints
  const insertComplaint = db.prepare(`
    INSERT INTO complaints (
      complaint_code, user_id, department_id, category, title, description,
      location_text, city, state, latitude, longitude,
      status, moderation_status, verification_label, source_attribution,
      resolution_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))
  `);

  const insertComplaintHistory = db.prepare(`
    INSERT INTO complaint_status_history (complaint_id, previous_status, new_status, changed_by, note, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))
  `);

  const complaintsSeed = [
    {
      code: 'PCM-CC-2026-2001',
      uid: citizenId,
      dept: deptRoads,
      cat: 'Road damage',
      title: 'Deep Pothole Cluster Near Nal Stop Metro Pillar',
      desc: 'Severe carriageway erosion causing two-wheeler skids near Nal Stop junction.',
      loc: 'Nal Stop Junction, Karve Road, Pune',
      city: 'Pune',
      state: 'Maharashtra',
      lat: 18.5089,
      lng: 73.8295,
      status: 'In Progress',
      mod: 'Approved Public',
      verif: 'Field Inspection Confirmed',
      notes: 'Cold-mix patching crew scheduled for night maintenance window.',
      cAgo: '-11 days',
      uAgo: '-2 days',
    },
    {
      code: 'PCM-CC-2026-2002',
      uid: citizen2Id,
      dept: deptWater,
      cat: 'Water supply problems',
      title: 'Low Pressure & Contaminated Supply in Kothrud Sector 4',
      desc: 'Morning water supply arriving turbid with significantly reduced pressure for 4 days.',
      loc: 'Paud Road, Kothrud, Pune',
      city: 'Pune',
      state: 'Maharashtra',
      lat: 18.5074,
      lng: 73.8077,
      status: 'Assigned',
      mod: 'Approved Public',
      verif: 'Verified Civic Complaint',
      notes: 'Valve inspection team assigned by PMC Water Department.',
      cAgo: '-7 days',
      uAgo: '-1 days',
    },
    {
      code: 'PCM-CC-2026-2003',
      uid: citizenId,
      dept: deptWaste,
      cat: 'Garbage management',
      title: 'Uncollected Open Waste Overflow Near Viman Nagar Park',
      desc: 'Secondary transfer bin overflowing onto footpath for 72 hours.',
      loc: 'Datta Mandir Chowk, Viman Nagar, Pune',
      city: 'Pune',
      state: 'Maharashtra',
      lat: 18.5679,
      lng: 73.9143,
      status: 'Resolved',
      mod: 'Approved Public',
      verif: 'Resolved & Photo Verified',
      notes: 'Cleared by Ward Solid Waste team and compactor schedule restored.',
      cAgo: '-16 days',
      uAgo: '-3 days',
    },
    {
      code: 'PCM-CC-2026-2004',
      uid: citizen2Id,
      dept: deptPower,
      cat: 'Electricity problems',
      title: 'Frequent Feeder Tripping Along Baner High Street',
      desc: 'Unscheduled voltage fluctuations and evening outages affecting residential blocks.',
      loc: 'Baner High Street, Pune',
      city: 'Pune',
      state: 'Maharashtra',
      lat: 18.559,
      lng: 73.7868,
      status: 'Under Review',
      mod: 'Approved Public',
      verif: 'Verified Civic Complaint',
      notes: 'Awaiting MSEDCL feeder load audit.',
      cAgo: '-5 days',
      uAgo: '-1 days',
    },
    {
      code: 'PCM-CC-2026-2005',
      uid: citizenId,
      dept: deptRoads,
      cat: 'Public infrastructure issues',
      title: 'Broken Pedestrian Guardrail Near Swargate Bus Terminus',
      desc: 'Damaged steel pedestrian barrier forcing commuters onto heavy bus lane.',
      loc: 'Swargate Junction, Pune',
      city: 'Pune',
      state: 'Maharashtra',
      lat: 18.5018,
      lng: 73.8636,
      status: 'Resolved',
      mod: 'Approved Public',
      verif: 'Resolved & Verified',
      notes: 'Barrier replaced and reflective bollards installed.',
      cAgo: '-22 days',
      uAgo: '-6 days',
    },
    {
      code: 'PCM-CC-2026-2006',
      uid: citizen2Id,
      dept: deptWater,
      cat: 'Sanitation',
      title: 'Blocked Stormwater Drain Grate at Koregaon Park Lane 5',
      desc: 'Clogged storm drain causing stagnant water and mosquito breeding.',
      loc: 'Lane 5, Koregaon Park, Pune',
      city: 'Pune',
      state: 'Maharashtra',
      lat: 18.5362,
      lng: 73.894,
      status: 'In Progress',
      mod: 'Approved Public',
      verif: 'Verified Civic Complaint',
      notes: 'Jetting vehicle dispatched.',
      cAgo: '-4 days',
      uAgo: '-1 days',
    },
    {
      code: 'PCM-CC-2026-2007',
      uid: citizenId,
      dept: deptRoads,
      cat: 'Road damage',
      title: 'Non-Functional Pedestrian Crossing Signal at Indiranagar 100ft Rd',
      desc: 'Pedestrian push-button signal offline for one week.',
      loc: 'Indiranagar 100ft Road, Bengaluru',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.9784,
      lng: 77.6408,
      status: 'Assigned',
      mod: 'Approved Public',
      verif: 'Verified Civic Complaint',
      notes: 'Traffic signal unit notified.',
      cAgo: '-9 days',
      uAgo: '-2 days',
    },
    {
      code: 'PCM-CC-2026-2008',
      uid: citizen2Id,
      dept: deptWaste,
      cat: 'Garbage management',
      title: 'Missing Segregated Waste Bins at Hadapsar Market',
      desc: 'Requesting restored dry/wet bins at public vegetable market exit.',
      loc: 'Hadapsar Gadital, Pune',
      city: 'Pune',
      state: 'Maharashtra',
      lat: 18.5011,
      lng: 73.9261,
      status: 'Submitted',
      mod: 'Pending Moderation',
      verif: 'Pending Verification',
      notes: null,
      cAgo: '-1 days',
      uAgo: '-1 days',
    },
  ];

  for (const c of complaintsSeed) {
    const cid = Number(
      insertComplaint.run(
        c.code,
        c.uid,
        c.dept,
        c.cat,
        c.title,
        c.desc,
        c.loc,
        c.city,
        c.state,
        c.lat,
        c.lng,
        c.status,
        c.mod,
        c.verif,
        'Citizen Civic Complaint',
        c.notes,
        c.cAgo,
        c.uAgo
      ).lastInsertRowid
    );
    insertComplaintHistory.run(cid, null, 'Submitted', c.uid, 'Complaint logged by citizen.', c.cAgo);
    if (c.status !== 'Submitted') {
      insertComplaintHistory.run(cid, 'Submitted', c.status, adminId, c.notes || 'Status updated by moderator.', c.uAgo);
    }
  }

  // Seed Peaceful Protest & Public Events
  const insertEvent = db.prepare(`
    INSERT INTO protest_events (
      event_code, organizer_id, external_source_id, title, category, description,
      public_location, city, state, latitude, longitude,
      start_time, end_time, expected_participants, status,
      verification_label, source_attribution, is_public, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?), ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))
  `);

  const insertEventHistory = db.prepare(`
    INSERT INTO event_status_history (event_id, previous_status, new_status, changed_by, note, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))
  `);

  const e1 = Number(
    insertEvent.run(
      'PCM-EV-2026-301',
      organizerId,
      null,
      'Pune Municipal Budget Transparency Townhall & March',
      'Public Budget & Transparency',
      'Peaceful citizen assembly and participatory ward-budget review walk demanding public disclosure of ward-level road & drainage contractor scorecards.',
      'Bal Gandharva Rangmandir Chowk, JM Road, Pune',
      'Pune',
      'Maharashtra',
      18.5204,
      73.8442,
      '+2 days',
      '+2 days',
      250,
      'Scheduled',
      'Verified Public Event (Organizer & Permit Checked)',
      'Organizer Public Submission (Verified)',
      1,
      '-8 days',
      '-2 days'
    ).lastInsertRowid
  );
  insertEventHistory.run(e1, null, 'Pending Moderation', organizerId, 'Submitted peaceful assembly announcement.', '-8 days');
  insertEventHistory.run(e1, 'Pending Moderation', 'Scheduled', adminId, 'Public venue & peaceful guidelines verified.', '-2 days');

  const e2 = Number(
    insertEvent.run(
      'PCM-EV-2026-302',
      organizerId,
      extSourceId,
      'Mula-Mutha Riverfront Ecological Protection Vigil',
      'Environmental Protection',
      'Peaceful evening candle vigil and citizen petition signing advocating transparent environmental impact disclosures along the riverfront corridor.',
      'Balgandharva Bridge Promenade, Shivajinagar, Pune',
      'Pune',
      'Maharashtra',
      18.5236,
      73.8492,
      '+0 days',
      '+1 days',
      180,
      'Active',
      'Verified Public Event (Open Civic Registry)',
      'Pune Open Civic Data Portal',
      1,
      '-10 days',
      '-1 hours'
    ).lastInsertRowid
  );
  insertEventHistory.run(e2, null, 'Scheduled', adminId, 'Synced from permitted open civic registry.', '-10 days');
  insertEventHistory.run(e2, 'Scheduled', 'Active', adminId, 'Event currently underway as scheduled.', '-1 hours');

  const e3 = Number(
    insertEvent.run(
      'PCM-EV-2026-303',
      organizerId,
      null,
      'FC Road Pedestrian Safety & Footpath Audit Walk',
      'Infrastructure & Safety',
      'Lawful citizen safety audit walk documenting broken footpaths, accessible curb ramps, and crosswalk visibility with ward engineers.',
      'Fergusson College Main Gate, FC Road, Pune',
      'Pune',
      'Maharashtra',
      18.5227,
      73.8414,
      '+5 days',
      '+5 days',
      120,
      'Scheduled',
      'Verified Public Event',
      'Organizer Public Submission (Verified)',
      1,
      '-5 days',
      '-1 days'
    ).lastInsertRowid
  );
  insertEventHistory.run(e3, null, 'Scheduled', adminId, 'Approved for public map display.', '-1 days');

  const e4 = Number(
    insertEvent.run(
      'PCM-EV-2026-304',
      organizerId,
      null,
      'Kothrud Equitable Water Distribution Public Forum',
      'Civic Accountability',
      'Community dialogue with resident welfare associations on publishing daily ward water-pressure telemetry.',
      'Yashwantrao Chavan Natyagruha Plaza, Kothrud, Pune',
      'Pune',
      'Maharashtra',
      18.5038,
      73.8124,
      '+9 days',
      '+9 days',
      150,
      'Scheduled',
      'Verified Public Event',
      'Organizer Public Submission (Verified)',
      1,
      '-3 days',
      '-1 days'
    ).lastInsertRowid
  );
  insertEventHistory.run(e4, null, 'Scheduled', adminId, 'Approved for public listing.', '-1 days');

  // Pending moderation event for Admin demo
  const e5 = Number(
    insertEvent.run(
      'PCM-EV-2026-305',
      organizerId,
      null,
      'Hinjewadi Commuter Transit Accountability Assembly',
      'Infrastructure & Safety',
      'Peaceful commuter gathering requesting dedicated bus bays and public schedule adherence along Phase 1–2 corridor.',
      'Shivaji Chowk Public Plaza, Hinjewadi, Pune',
      'Pune',
      'Maharashtra',
      18.5913,
      73.7389,
      '+12 days',
      '+12 days',
      200,
      'Pending Moderation',
      'Pending Moderator Review',
      'Organizer Public Submission',
      0,
      '-1 days',
      '-1 days'
    ).lastInsertRowid
  );
  insertEventHistory.run(e5, null, 'Pending Moderation', organizerId, 'Submitted for moderation review.', '-1 days');

  // Volunteers
  db.prepare(
    `INSERT INTO volunteers (event_id, user_id, role_preference, availability_notes, status)
     VALUES (?, ?, ?, ?, ?)`
  ).run(e1, citizenId, 'First Aid & Water Desk', 'Available 4 PM - 8 PM', 'Confirmed');
  db.prepare(
    `INSERT INTO volunteers (event_id, user_id, role_preference, availability_notes, status)
     VALUES (?, ?, ?, ?, ?)`
  ).run(e2, citizen2Id, 'Accessibility Marshall', 'Available full duration', 'Registered');
  db.prepare(
    `INSERT INTO volunteers (event_id, user_id, role_preference, availability_notes, status)
     VALUES (?, ?, ?, ?, ?)`
  ).run(e3, citizenId, 'Documentation & Checklist', 'Bringing measuring tape for ramp audit', 'Registered');

  // Announcements
  db.prepare(
    `INSERT INTO announcements (event_id, author_id, title, content, is_pinned)
     VALUES (?, ?, ?, ?, 1)`
  ).run(
    e1,
    organizerId,
    'Peaceful Assembly Protocol & Route Briefing',
    'Participants are requested to assemble along the designated footpath plaza near Bal Gandharva Chowk without obstructing emergency lanes. Drinking water stations are managed by verified volunteers.',
  );
  db.prepare(
    `INSERT INTO announcements (event_id, author_id, title, content, is_pinned)
     VALUES (?, ?, ?, ?, 0)`
  ).run(
    e2,
    organizerId,
    'Zero-Plastic Vigil Reminder',
    'Please carry reusable water bottles and battery-operated lanterns. Zero single-use plastics will be permitted at the riverfront promenade.',
  );

  // Notifications
  db.prepare(
    `INSERT INTO notifications (user_id, type, title, message, link_path, is_read)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    citizenId,
    'corruption_update',
    'Report PCM-CR-2026-1041 Verified for Action',
    'Your submission regarding Ward 14 footpath resurfacing has progressed to Verified for Further Action.',
    'corruption',
    0
  );
  db.prepare(
    `INSERT INTO notifications (user_id, type, title, message, link_path, is_read)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    citizenId,
    'event_announcement',
    'Announcement: Pune Municipal Budget Transparency Townhall',
    'New peaceful assembly protocol posted by organizer Rohan Kulkarni.',
    'protests',
    0
  );
  db.prepare(
    `INSERT INTO notifications (user_id, type, title, message, link_path, is_read)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    organizerId,
    'event_approval',
    'Event PCM-EV-2026-301 Approved for Public Map',
    'Your event "Pune Municipal Budget Transparency Townhall & March" is now live on the Real-Time Civic Map.',
    'map',
    0
  );
  db.prepare(
    `INSERT INTO notifications (user_id, type, title, message, link_path, is_read)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    adminId,
    'system_notice',
    'Moderation Queue: 3 Pending Items',
    '1 corruption allegation, 1 civic complaint, and 1 public event await moderation review.',
    'admin',
    0
  );

  // Audit logs
  const insertAudit = db.prepare(
    `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, details, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`
  );
  insertAudit.run(adminId, 'admin', 'APPROVE_PUBLIC_HOTSPOT', 'corruption_report', 'PCM-CR-2026-1041', 'Published generalized ward hotspot (1.1km precision) after documentation review.', '127.0.0.1', '-3 days');
  insertAudit.run(adminId, 'admin', 'APPROVE_PROTEST_EVENT', 'protest_event', 'PCM-EV-2026-301', 'Verified public venue and peaceful assembly checklist.', '127.0.0.1', '-2 days');
  insertAudit.run(adminId, 'admin', 'RESTRICT_CONFIDENTIAL_REPORT', 'corruption_report', 'PCM-CR-2026-1047', 'Marked whistleblower submission as Confidential - Restricted.', '127.0.0.1', '-1 days');
}
