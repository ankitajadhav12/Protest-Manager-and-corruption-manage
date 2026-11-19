export type UserRole = 'citizen' | 'organizer' | 'admin';

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  city: string;
  organization_name: string | null;
  is_active: number;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  jurisdiction: string;
  contact_email?: string;
  description?: string;
  is_active?: number;
}

export interface CorruptionReport {
  id: number;
  tracking_id: string;
  department_id: number;
  department_name: string;
  category: string;
  title: string;
  description: string;
  general_location: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  is_anonymous: number | boolean;
  is_confidential?: number | boolean;
  status: string;
  moderation_status: string;
  verification_label: string;
  source_attribution: string;
  potential_duplicate_of: string | null;
  admin_notes?: string | null;
  is_public_hotspot?: number;
  reporter_display?: string;
  created_at: string;
  updated_at: string;
}

export interface CivicComplaint {
  id: number;
  complaint_code: string;
  department_id: number | null;
  department_name: string | null;
  category: string;
  title: string;
  description: string;
  location_text: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  status: string;
  moderation_status: string;
  verification_label: string;
  source_attribution: string;
  potential_duplicate_of: string | null;
  resolution_notes: string | null;
  reporter_name?: string;
  created_at: string;
  updated_at: string;
}

export interface EventAnnouncement {
  id: number;
  title: string;
  content: string;
  is_pinned: number;
  created_at: string;
  author_name: string;
}

export interface ProtestEvent {
  id: number;
  event_code: string;
  organizer_id: number;
  organizer_name?: string;
  organizer_org?: string | null;
  title: string;
  category: string;
  description: string;
  public_location: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  start_time: string;
  end_time: string;
  expected_participants: number;
  status: string;
  verification_label: string;
  source_attribution: string;
  moderation_notes?: string | null;
  is_public: number;
  volunteer_count: number;
  announcements?: EventAnnouncement[];
  my_volunteer_status?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuplicateCandidate {
  reference_code: string;
  title: string;
  category: string;
  location: string;
  status: string;
  similarity_score: number;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  link_path: string | null;
  is_read: number;
  created_at: string;
}

export interface GeocodeResult {
  display_name: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
}

export interface AnalyticsPayload {
  kpis: {
    total_corruption_reports: number;
    total_complaints: number;
    pending_reports: number;
    verified_reports: number;
    resolved_complaints: number;
    active_protests: number;
    upcoming_events: number;
    total_volunteers: number;
  };
  department_distribution: Array<{
    department: string;
    corruption_count: number;
    complaint_count: number;
  }>;
  complaint_categories: Array<{ category: string; count: number }>;
  corruption_categories: Array<{ category: string; count: number }>;
  resolution_stats: Array<{ status: string; count: number }>;
  report_workflow_stats: Array<{ status: string; count: number }>;
  monthly_trends: Array<{ month: string; complaints: number; corruption_reports: number }>;
  geographic_activity: Array<{ city: string; complaints: number; reports: number; events: number }>;
}

export type ActiveTab =
  | 'landing'
  | 'map'
  | 'corruption'
  | 'complaints'
  | 'protests'
  | 'analytics'
  | 'admin'
  | 'profile';
