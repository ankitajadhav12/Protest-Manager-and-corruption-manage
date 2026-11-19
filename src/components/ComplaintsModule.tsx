import { AlertTriangle, CheckCircle2, Search, Upload } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost, apiUpload, formatDateTime, getStatusColorClass } from '../lib/api';
import type { CivicComplaint, Department, DuplicateCandidate, User } from '../types';
import { LocationPicker } from './LocationPicker';

interface ComplaintsModuleProps {
  user: User | null;
  initialTrackCode?: string | null;
}

const COMPLAINT_CATEGORIES = [
  'Road damage',
  'Water supply problems',
  'Garbage management',
  'Electricity problems',
  'Public infrastructure issues',
  'Sanitation',
  'Other civic issues',
];

export function ComplaintsModule({ user, initialTrackCode }: ComplaintsModuleProps) {
  const [subTab, setSubTab] = useState<'list' | 'submit' | 'track'>(
    initialTrackCode ? 'track' : 'list'
  );
  const [complaints, setComplaints] = useState<CivicComplaint[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Form
  const [category, setCategory] = useState(COMPLAINT_CATEGORIES[0]);
  const [departmentId, setDepartmentId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('Kothrud, Pune');
  const [city, setCity] = useState('Pune');
  const [stateName, setStateName] = useState('Maharashtra');
  const [lat, setLat] = useState(18.5074);
  const [lng, setLng] = useState(73.8077);
  const [photo, setPhoto] = useState<File | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  // Track
  const [trackCode, setTrackCode] = useState(initialTrackCode || 'PCM-CC-2026-2001');
  const [tracked, setTracked] = useState<{
    complaint: CivicComplaint;
    history: Array<{ previous_status: string | null; new_status: string; note: string; created_at: string }>;
  } | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);

  async function refreshComplaints() {
    const qs = categoryFilter !== 'all' ? `?category=${encodeURIComponent(categoryFilter)}` : '';
    const res = await apiGet<{ complaints: CivicComplaint[] }>(`/api/complaints${qs}`);
    setComplaints(res.complaints || []);
  }

  useEffect(() => {
    refreshComplaints();
  }, [categoryFilter, user]);

  useEffect(() => {
    apiGet<{ departments: Department[] }>('/api/departments').then((d) =>
      setDepartments(d.departments || [])
    );
  }, []);

  useEffect(() => {
    if (initialTrackCode) {
      setSubTab('track');
      setTrackCode(initialTrackCode);
      handleTrack(initialTrackCode);
    }
  }, [initialTrackCode]);

  async function checkDuplicates() {
    if (title.trim().length < 5 || description.trim().length < 15) return;
    try {
      const res = await apiPost<{ duplicates: DuplicateCandidate[] }>(
        '/api/complaints/check-duplicates',
        { title, description, category, location_text: locationText }
      );
      setDuplicates(res.duplicates || []);
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedCode(null);
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append('category', category);
      if (departmentId) fd.append('department_id', departmentId);
      fd.append('title', title);
      fd.append('description', description);
      fd.append('location_text', locationText);
      fd.append('city', city);
      fd.append('state', stateName);
      fd.append('latitude', String(lat));
      fd.append('longitude', String(lng));
      if (photo) fd.append('photo', photo);

      const res = await apiUpload<{ complaint_code: string }>('/api/complaints', fd);
      setCreatedCode(res.complaint_code);
      setTrackCode(res.complaint_code);
      setTitle('');
      setDescription('');
      setPhoto(null);
      setDuplicates([]);
      await refreshComplaints();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTrack(codeOverride?: string) {
    const code = (codeOverride || trackCode).trim();
    if (!code) return;
    setTrackError(null);
    try {
      const res = await apiGet<{
        complaint: CivicComplaint;
        history: Array<{ previous_status: string | null; new_status: string; note: string; created_at: string }>;
      }>(`/api/complaints/track/${encodeURIComponent(code)}`);
      setTracked(res);
    } catch (err) {
      setTracked(null);
      setTrackError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#1E2D4A] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Civic Complaint Management
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            Report municipal infrastructure, road, water, sanitation, and power issues with live
            resolution tracking.
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-[#1E2D4A] bg-[#0D1629] p-1 self-start">
          <button
            type="button"
            onClick={() => setSubTab('list')}
            className={`rounded-md px-3.5 py-2 text-xs font-medium cursor-pointer ${
              subTab === 'list' ? 'bg-[#131F38] text-cyan-400' : 'text-slate-300 hover:text-white'
            }`}
          >
            Public Complaints ({complaints.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('submit')}
            className={`rounded-md px-3.5 py-2 text-xs font-medium cursor-pointer ${
              subTab === 'submit' ? 'bg-[#131F38] text-cyan-400' : 'text-slate-300 hover:text-white'
            }`}
          >
            File Complaint
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('track');
              if (!tracked) handleTrack();
            }}
            className={`rounded-md px-3.5 py-2 text-xs font-medium cursor-pointer ${
              subTab === 'track' ? 'bg-[#131F38] text-cyan-400' : 'text-slate-300 hover:text-white'
            }`}
          >
            Track ID
          </button>
        </div>
      </div>

      {subTab === 'list' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium border cursor-pointer ${
                  categoryFilter === 'all'
                    ? 'border-cyan-500/50 bg-[#131F38] text-cyan-300'
                    : 'border-[#1E2D4A] bg-[#0D1629] text-slate-300'
                }`}
              >
                All Issues
              </button>
              {COMPLAINT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium border cursor-pointer ${
                    categoryFilter === c
                      ? 'border-cyan-500/50 bg-[#131F38] text-cyan-300'
                      : 'border-[#1E2D4A] bg-[#0D1629] text-slate-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#1E2D4A] bg-[#0D1629]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1E2D4A] bg-[#070D1A] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Complaint ID</th>
                  <th className="px-4 py-3 font-medium">Issue & Location</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D4A]">
                {complaints.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setSubTab('track');
                      setTrackCode(c.complaint_code);
                      handleTrack(c.complaint_code);
                    }}
                    className="hover:bg-[#131F38] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3.5 font-mono text-cyan-400 whitespace-nowrap">
                      {c.complaint_code}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-white">{c.title}</div>
                      <div className="text-slate-400 mt-0.5">{c.location_text}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">{c.category}</td>
                    <td className="px-4 py-3.5 text-slate-300">
                      {c.department_name || 'Pending Assignment'}
                    </td>
                    <td className={`px-4 py-3.5 font-semibold whitespace-nowrap ${getStatusColorClass(c.status)}`}>
                      {c.status}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-400 tabular-nums whitespace-nowrap">
                      {formatDateTime(c.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'submit' && (
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 space-y-5"
        >
          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          {createdCode && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Civic Complaint Logged
                </div>
                <div className="font-mono text-sm font-bold text-white">{createdCode}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSubTab('track');
                  handleTrack(createdCode);
                }}
                className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 cursor-pointer"
              >
                Track Status
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Civic Issue Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
              >
                {COMPLAINT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Suggested Department (Optional)
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="">Auto-assign by moderator</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Complaint Title</label>
            <input
              type="text"
              required
              minLength={5}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={checkDuplicates}
              placeholder="e.g., Damaged storm drain cover on Paud Road"
              className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Description</label>
            <textarea
              required
              minLength={15}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={checkDuplicates}
              placeholder="Describe the civic hazard, duration, and nearby public landmark."
              className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
            />
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                Potential Duplicate Complaints Found
              </div>
              {duplicates.map((d) => (
                <div key={d.reference_code} className="flex justify-between text-slate-200">
                  <span>
                    <span className="font-mono text-cyan-300">{d.reference_code}</span> · {d.title}
                  </span>
                  <span className="font-mono text-amber-300">{Math.round(d.similarity_score * 100)}%</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Location</label>
            <input
              type="text"
              required
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
            />
            <LocationPicker
              latitude={lat}
              longitude={lng}
              locationLabel={locationText}
              onSelectLocation={(loc) => {
                setLat(loc.lat);
                setLng(loc.lng);
                setLocationText(loc.address);
                setCity(loc.city);
                setStateName(loc.state);
              }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Optional Site Photo (JPG/PNG/WEBP, max 5MB)
            </label>
            <label className="flex items-center justify-between rounded-lg border border-dashed border-[#1E2D4A] bg-[#070D1A] px-4 py-3 text-xs text-slate-300 cursor-pointer">
              <span className="inline-flex items-center gap-2">
                <Upload className="h-4 w-4 text-cyan-400" />
                {photo ? photo.name : 'Attach photo of civic issue'}
              </span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Submitting...' : 'Submit Civic Complaint'}
          </button>
        </form>
      )}

      {subTab === 'track' && (
        <div className="space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleTrack();
            }}
            className="flex flex-col sm:flex-row gap-3 rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={trackCode}
                onChange={(e) => setTrackCode(e.target.value)}
                placeholder="Enter Complaint ID (e.g., PCM-CC-2026-2001)"
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] pl-9 pr-4 py-2.5 font-mono text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
            >
              Lookup Complaint
            </button>
          </form>

          {trackError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300">
              {trackError}
            </div>
          )}

          {tracked && (
            <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2D4A] pb-4">
                <div>
                  <div className="text-xs font-mono text-cyan-400">
                    {tracked.complaint.complaint_code} · {tracked.complaint.category}
                  </div>
                  <h2 className="mt-1 font-display text-xl font-semibold text-white">
                    {tracked.complaint.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {tracked.complaint.location_text} ·{' '}
                    {tracked.complaint.department_name || 'Pending Department Assignment'}
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${getStatusColorClass(tracked.complaint.status)}`}>
                    {tracked.complaint.status}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {tracked.complaint.verification_label}
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed">{tracked.complaint.description}</p>

              {tracked.complaint.resolution_notes && (
                <div className="rounded-lg border border-[#1E2D4A] bg-[#070D1A] p-3.5 text-xs text-slate-300">
                  <span className="font-semibold text-white">Department Resolution Note:</span>{' '}
                  {tracked.complaint.resolution_notes}
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Complaint Status History</h3>
                <div className="divide-y divide-[#1E2D4A] rounded-lg border border-[#1E2D4A] bg-[#070D1A]">
                  {tracked.history.map((h, i) => (
                    <div key={i} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-semibold text-white">{h.new_status}</span>
                        {h.note && <p className="mt-0.5 text-slate-400">{h.note}</p>}
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                        {formatDateTime(h.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
