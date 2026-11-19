import { Check, Plus, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPatch, apiPost, formatDateTime, getStatusColorClass } from '../lib/api';
import type { CivicComplaint, CorruptionReport, Department, ProtestEvent, User } from '../types';

interface AdminModuleProps {
  user: User | null;
  onDataChanged: () => void;
}

interface AdminOverview {
  users: Array<User & { created_at: string }>;
  departments: Department[];
  corruption_reports: CorruptionReport[];
  complaints: CivicComplaint[];
  events: ProtestEvent[];
  volunteers: Array<{
    id: number;
    full_name: string;
    email: string;
    event_title: string;
    event_code: string;
    role_preference: string;
    status: string;
    created_at: string;
  }>;
  audit_logs: Array<{
    id: number;
    actor_name: string | null;
    actor_role: string;
    action: string;
    entity_type: string;
    entity_id: string;
    details: string | null;
    created_at: string;
  }>;
}

type AdminSection = 'events' | 'corruption' | 'complaints' | 'departments' | 'users' | 'volunteers' | 'audit';

export function AdminModule({ user, onDataChanged }: AdminModuleProps) {
  const [section, setSection] = useState<AdminSection>('events');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Department creation
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptJurisdiction, setDeptJurisdiction] = useState('Pune Municipal Corporation');
  const [deptEmail, setDeptEmail] = useState('');

  async function loadOverview() {
    try {
      const res = await apiGet<AdminOverview>('/api/admin/overview');
      setData(res);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') {
      loadOverview();
    }
  }, [user]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center space-y-3">
        <ShieldCheck className="mx-auto h-10 w-10 text-amber-400" />
        <h1 className="font-display text-xl font-bold text-white">Administrator Access Required</h1>
        <p className="text-sm text-slate-400">
          This moderation console is restricted to authorized PCM administrators.
        </p>
      </div>
    );
  }

  async function moderateEvent(
    id: number,
    payload: { status: string; is_public: boolean; moderation_notes?: string }
  ) {
    await apiPatch(`/api/admin/events/${id}`, payload);
    setActionNotice(
      payload.is_public
        ? 'Event approved and published to the Real-Time Civic Map via WebSocket.'
        : `Event status updated to ${payload.status}.`
    );
    await loadOverview();
    onDataChanged();
  }

  async function moderateReport(
    id: number,
    payload: {
      status: string;
      moderation_status: string;
      is_public_hotspot?: boolean;
      is_confidential?: boolean;
      admin_notes?: string;
    }
  ) {
    await apiPatch(`/api/admin/corruption-reports/${id}`, payload);
    setActionNotice(
      payload.is_public_hotspot
        ? 'Corruption report verified and generalized (~1.1km) hotspot broadcast to live map.'
        : `Corruption report status updated to ${payload.status}.`
    );
    await loadOverview();
    onDataChanged();
  }

  async function moderateComplaint(
    id: number,
    payload: { status: string; moderation_status: string; department_id?: number; resolution_notes?: string }
  ) {
    await apiPatch(`/api/admin/complaints/${id}`, payload);
    setActionNotice(`Complaint updated to ${payload.status} (${payload.moderation_status}).`);
    await loadOverview();
    onDataChanged();
  }

  async function updateUserRole(userId: number, role: string, isActive: boolean) {
    await apiPatch(`/api/admin/users/${userId}`, { role, is_active: isActive });
    setActionNotice('User role/access updated.');
    await loadOverview();
  }

  async function updateVolunteer(volId: number, status: string) {
    await apiPatch(`/api/admin/volunteers/${volId}`, { status });
    setActionNotice(`Volunteer updated to ${status}.`);
    await loadOverview();
  }

  async function createDepartment(e: FormEvent) {
    e.preventDefault();
    await apiPost('/api/admin/departments', {
      name: deptName,
      code: deptCode,
      jurisdiction: deptJurisdiction,
      contact_email: deptEmail,
    });
    setDeptName('');
    setDeptCode('');
    setDeptEmail('');
    setActionNotice('Department created.');
    await loadOverview();
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#1E2D4A] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Administrative Moderation & Oversight Console
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            Verify submissions, assign departments, publish approved map updates in real time, and
            audit platform actions.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}
      {actionNotice && (
        <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3 text-xs text-cyan-200">
          {actionNotice}
        </div>
      )}

      {/* Segmented Section Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-[#1E2D4A] bg-[#0D1629] p-1">
        {(
          [
            ['events', `Events (${data?.events.length || 0})`],
            ['corruption', `Corruption (${data?.corruption_reports.length || 0})`],
            ['complaints', `Complaints (${data?.complaints.length || 0})`],
            ['departments', `Departments (${data?.departments.length || 0})`],
            ['users', `Users (${data?.users.length || 0})`],
            ['volunteers', `Volunteers (${data?.volunteers.length || 0})`],
            ['audit', 'Audit Logs'],
          ] as Array<[AdminSection, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`rounded-md px-3.5 py-2 text-xs font-medium cursor-pointer whitespace-nowrap ${
              section === id ? 'bg-[#131F38] text-cyan-400' : 'text-slate-300 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading admin overview...</div>
      ) : (
        <>
          {/* Events Moderation */}
          {section === 'events' && (
            <div className="space-y-3">
              {data.events.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="text-cyan-400">{ev.event_code}</span>
                      <span className="text-slate-500">·</span>
                      <span className={getStatusColorClass(ev.status)}>{ev.status}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400">
                        {ev.is_public ? 'Public on Map' : 'Hidden / Pending'}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-white">{ev.title}</h3>
                    <p className="text-xs text-slate-400">
                      Organizer: {ev.organizer_name} ({ev.organizer_org || 'Independent'}) ·{' '}
                      {ev.public_location} · {formatDateTime(ev.start_time)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        moderateEvent(ev.id, {
                          status: 'Scheduled',
                          is_public: true,
                          moderation_notes: 'Verified peaceful public venue & guidelines.',
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve & Publish
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        moderateEvent(ev.id, {
                          status: 'Correction Requested',
                          is_public: false,
                          moderation_notes: 'Please clarify venue boundaries and steward contacts.',
                        })
                      }
                      className="rounded-md border border-amber-500/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/10 cursor-pointer"
                    >
                      Request Correction
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        moderateEvent(ev.id, {
                          status: 'Rejected',
                          is_public: false,
                          moderation_notes: 'Does not meet civic event guidelines.',
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Corruption Reports Verification */}
          {section === 'corruption' && (
            <div className="space-y-3">
              {data.corruption_reports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                        <span className="text-cyan-400">{r.tracking_id}</span>
                        <span className="text-slate-500">·</span>
                        <span className={getStatusColorClass(r.status)}>{r.status}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-300">
                          Reporter: {r.reporter_display}
                        </span>
                        {r.potential_duplicate_of && (
                          <>
                            <span className="text-slate-500">·</span>
                            <span className="text-amber-300">
                              Possible Duplicate of {r.potential_duplicate_of}
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="mt-1 font-display text-base font-semibold text-white">
                        {r.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {r.category} · {r.department_name} · {r.general_location}
                      </p>
                    </div>
                    <span className="text-xs text-slate-300 font-mono">
                      {r.moderation_status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{r.description}</p>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1E2D4A]">
                    <button
                      type="button"
                      onClick={() =>
                        moderateReport(r.id, {
                          status: 'Under Review',
                          moderation_status: r.moderation_status,
                        })
                      }
                      className="rounded-md border border-[#1E2D4A] bg-[#070D1A] px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-500/40 cursor-pointer"
                    >
                      Mark Under Review
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        moderateReport(r.id, {
                          status: 'Verified for Further Action',
                          moderation_status: 'Approved for Public Hotspot',
                          is_public_hotspot: true,
                          is_confidential: false,
                          admin_notes: 'Report details verified; generalized hotspot published.',
                        })
                      }
                      className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                    >
                      Verify & Publish Generalized Hotspot
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        moderateReport(r.id, {
                          status: 'Referred to Authority',
                          moderation_status: r.moderation_status,
                        })
                      }
                      className="rounded-md border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/10 cursor-pointer"
                    >
                      Refer to Authority
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        moderateReport(r.id, {
                          status: 'Action Recorded',
                          moderation_status: r.moderation_status,
                        })
                      }
                      className="rounded-md border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 cursor-pointer"
                    >
                      Record Action
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        moderateReport(r.id, {
                          status: r.status,
                          moderation_status: 'Confidential - Restricted',
                          is_confidential: true,
                          is_public_hotspot: false,
                        })
                      }
                      className="rounded-md border border-amber-500/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/10 cursor-pointer"
                    >
                      Restrict Confidential
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Civic Complaints Moderation */}
          {section === 'complaints' && (
            <div className="space-y-3">
              {data.complaints.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="text-cyan-400">{c.complaint_code}</span>
                      <span className="text-slate-500">·</span>
                      <span className={getStatusColorClass(c.status)}>{c.status}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400">{c.moderation_status}</span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-white">{c.title}</h3>
                    <p className="text-xs text-slate-400">
                      {c.category} · {c.location_text} · Dept: {c.department_name || 'Unassigned'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label="Assign department"
                      defaultValue={c.department_id || ''}
                      onChange={(e) =>
                        moderateComplaint(c.id, {
                          status: 'Assigned',
                          moderation_status: 'Approved Public',
                          department_id: Number(e.target.value),
                        })
                      }
                      className="rounded-md border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">Assign Dept...</option>
                      {data.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        moderateComplaint(c.id, {
                          status: 'In Progress',
                          moderation_status: 'Approved Public',
                        })
                      }
                      className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                    >
                      Approve Public
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        moderateComplaint(c.id, {
                          status: 'Resolved',
                          moderation_status: 'Approved Public',
                          resolution_notes: 'Verified resolved by municipal department.',
                        })
                      }
                      className="rounded-md border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 cursor-pointer"
                    >
                      Mark Resolved
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Departments Management */}
          {section === 'departments' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={createDepartment}
                className="lg:col-span-4 rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5 space-y-3 self-start"
              >
                <h3 className="font-display text-base font-semibold text-white">
                  Add Government Department
                </h3>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Department Name"
                  className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  required
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder="Code (e.g., PMC-HEALTH)"
                  className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 font-mono text-xs text-white"
                />
                <input
                  type="text"
                  value={deptJurisdiction}
                  onChange={(e) => setDeptJurisdiction(e.target.value)}
                  placeholder="Jurisdiction"
                  className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-xs text-white"
                />
                <input
                  type="email"
                  value={deptEmail}
                  onChange={(e) => setDeptEmail(e.target.value)}
                  placeholder="Contact Email"
                  className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-500 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Department
                </button>
              </form>

              <div className="lg:col-span-8 divide-y divide-[#1E2D4A] rounded-xl border border-[#1E2D4A] bg-[#0D1629]">
                {data.departments.map((d) => (
                  <div key={d.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="font-semibold text-white">{d.name}</div>
                      <div className="text-slate-400 mt-0.5">
                        <span className="font-mono text-cyan-400">{d.code}</span> · {d.jurisdiction}
                      </div>
                    </div>
                    <span className="text-emerald-400 font-mono">
                      {d.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Management */}
          {section === 'users' && (
            <div className="overflow-x-auto rounded-xl border border-[#1E2D4A] bg-[#0D1629]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#070D1A] text-slate-400 border-b border-[#1E2D4A]">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">City</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Account Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D4A]">
                  {data.users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{u.full_name}</div>
                        <div className="text-slate-400">{u.email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{u.city}</td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Role for ${u.full_name}`}
                          value={u.role}
                          onChange={(e) => updateUserRole(u.id, e.target.value, u.is_active === 1)}
                          className="rounded border border-[#1E2D4A] bg-[#070D1A] px-2 py-1 text-xs text-white"
                        >
                          <option value="citizen">citizen</option>
                          <option value="organizer">organizer</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <span className={u.is_active ? 'text-emerald-400' : 'text-rose-400'}>
                          {u.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => updateUserRole(u.id, u.role, u.is_active !== 1)}
                          className="rounded border border-[#1E2D4A] px-2.5 py-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                        >
                          {u.is_active ? 'Suspend' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Volunteers Management */}
          {section === 'volunteers' && (
            <div className="overflow-x-auto rounded-xl border border-[#1E2D4A] bg-[#0D1629]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#070D1A] text-slate-400 border-b border-[#1E2D4A]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Volunteer</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Role Preference</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D4A]">
                  {data.volunteers.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{v.full_name}</div>
                        <div className="text-slate-400">{v.email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        <span className="font-mono text-cyan-400">{v.event_code}</span> · {v.event_title}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{v.role_preference}</td>
                      <td className={`px-4 py-3 font-semibold ${getStatusColorClass(v.status)}`}>
                        {v.status}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => updateVolunteer(v.id, 'Confirmed')}
                          className="rounded border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-300 cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => updateVolunteer(v.id, 'Cancelled')}
                          className="rounded border border-rose-500/40 px-2.5 py-1 text-xs text-rose-300 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Audit Logs */}
          {section === 'audit' && (
            <div className="overflow-x-auto rounded-xl border border-[#1E2D4A] bg-[#0D1629]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#070D1A] text-slate-400 border-b border-[#1E2D4A]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Entity</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D4A]">
                  {data.audit_logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-200">
                        {log.actor_name || 'Anonymous'} ({log.actor_role})
                      </td>
                      <td className="px-4 py-3 font-mono text-cyan-400">{log.action}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {log.entity_type} · {log.entity_id || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{log.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
