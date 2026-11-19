import { AlertTriangle, FileCheck2, Lock, Search, Shield, Upload } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost, apiUpload, formatDateTime, getStatusColorClass } from '../lib/api';
import type { CorruptionReport, Department, DuplicateCandidate, User } from '../types';
import { LocationPicker } from './LocationPicker';

interface CorruptionModuleProps {
  user: User | null;
  initialTrackCode?: string | null;
}

const CORRUPTION_CATEGORIES = [
  'Bribery',
  'Misuse of public funds',
  'Administrative corruption',
  'Fraud',
  'Abuse of authority',
  'Other suspected corruption',
];

const WORKFLOW_STEPS = [
  'Submitted',
  'Under Review',
  'Verified for Further Action',
  'Referred to Authority',
  'Action Recorded',
  'Closed',
];

export function CorruptionModule({ user, initialTrackCode }: CorruptionModuleProps) {
  const [subTab, setSubTab] = useState<'submit' | 'track' | 'public'>(
    initialTrackCode ? 'track' : 'submit'
  );
  const [departments, setDepartments] = useState<Department[]>([]);
  const [publicReports, setPublicReports] = useState<CorruptionReport[]>([]);
  const [myReports, setMyReports] = useState<CorruptionReport[]>([]);

  // Form state
  const [departmentId, setDepartmentId] = useState<number>(0);
  const [category, setCategory] = useState(CORRUPTION_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [generalLocation, setGeneralLocation] = useState('Shivajinagar, Pune');
  const [city, setCity] = useState('Pune');
  const [stateName, setStateName] = useState('Maharashtra');
  const [lat, setLat] = useState(18.5308);
  const [lng, setLng] = useState(73.8475);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isConfidential, setIsConfidential] = useState(true);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTrackingId, setCreatedTrackingId] = useState<string | null>(null);

  // Tracker state
  const [trackInput, setTrackInput] = useState(initialTrackCode || 'PCM-CR-2026-1041');
  const [trackedData, setTrackedData] = useState<{
    report: CorruptionReport & { ethical_notice?: string };
    history: Array<{ previous_status: string | null; new_status: string; note: string; created_at: string }>;
    evidence: Array<{ id: number; original_filename: string; file_size: number; created_at: string }>;
  } | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ departments: Department[] }>('/api/departments').then((d) => {
      setDepartments(d.departments || []);
      if (d.departments?.length > 0) {
        setDepartmentId(d.departments[0].id);
      }
    });
    apiGet<{ reports: CorruptionReport[] }>('/api/corruption-reports').then((r) => {
      setPublicReports(r.reports || []);
    });
  }, []);

  useEffect(() => {
    if (user) {
      apiGet<{ reports: CorruptionReport[] }>('/api/corruption-reports/mine')
        .then((r) => setMyReports(r.reports || []))
        .catch(() => setMyReports([]));
    } else {
      setMyReports([]);
    }
  }, [user, createdTrackingId]);

  useEffect(() => {
    if (initialTrackCode) {
      setSubTab('track');
      setTrackInput(initialTrackCode);
      handleTrackLookup(initialTrackCode);
    }
  }, [initialTrackCode]);

  async function checkDuplicatesLive() {
    if (title.trim().length < 6 || description.trim().length < 15) return;
    try {
      const res = await apiPost<{ duplicates: DuplicateCandidate[] }>(
        '/api/corruption-reports/check-duplicates',
        {
          title,
          description,
          category,
          department_id: departmentId,
          general_location: generalLocation,
        }
      );
      setDuplicates(res.duplicates || []);
    } catch {
      // ignore passive check errors
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setCreatedTrackingId(null);
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append('department_id', String(departmentId));
      fd.append('category', category);
      fd.append('title', title);
      fd.append('description', description);
      fd.append('general_location', generalLocation);
      fd.append('city', city);
      fd.append('state', stateName);
      fd.append('latitude', String(lat));
      fd.append('longitude', String(lng));
      fd.append('is_anonymous', String(isAnonymous));
      fd.append('is_confidential', String(isConfidential));
      if (evidenceFile) {
        fd.append('evidence_file', evidenceFile);
      }

      const res = await apiUpload<{ tracking_id: string }>('/api/corruption-reports', fd);
      setCreatedTrackingId(res.tracking_id);
      setTrackInput(res.tracking_id);
      setTitle('');
      setDescription('');
      setEvidenceFile(null);
      setDuplicates([]);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTrackLookup(codeArg?: string) {
    const code = (codeArg || trackInput).trim();
    if (!code) return;
    setTrackError(null);
    try {
      const res = await apiGet<{
        report: CorruptionReport & { ethical_notice?: string };
        history: Array<{ previous_status: string | null; new_status: string; note: string; created_at: string }>;
        evidence: Array<{ id: number; original_filename: string; file_size: number; created_at: string }>;
      }>(`/api/corruption-reports/track/${encodeURIComponent(code)}`);
      setTrackedData(res);
    } catch (err) {
      setTrackedData(null);
      setTrackError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#1E2D4A] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Corruption Reporting & Allegation Tracker
          </h1>
          <p className="mt-1.5 text-sm text-slate-300 max-w-3xl">
            Submit suspected corruption allegations confidentially or anonymously. Reports are
            moderated prior to any generalized public hotspot publication.
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-[#1E2D4A] bg-[#0D1629] p-1 self-start">
          <button
            type="button"
            onClick={() => setSubTab('submit')}
            className={`rounded-md px-3.5 py-2 text-xs font-medium cursor-pointer whitespace-nowrap ${
              subTab === 'submit' ? 'bg-[#131F38] text-cyan-400' : 'text-slate-300 hover:text-white'
            }`}
          >
            Submit Report
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('track');
              if (!trackedData) handleTrackLookup();
            }}
            className={`rounded-md px-3.5 py-2 text-xs font-medium cursor-pointer whitespace-nowrap ${
              subTab === 'track' ? 'bg-[#131F38] text-cyan-400' : 'text-slate-300 hover:text-white'
            }`}
          >
            Track by ID
          </button>
          <button
            type="button"
            onClick={() => setSubTab('public')}
            className={`rounded-md px-3.5 py-2 text-xs font-medium cursor-pointer whitespace-nowrap ${
              subTab === 'public' ? 'bg-[#131F38] text-cyan-400' : 'text-slate-300 hover:text-white'
            }`}
          >
            Moderated Hotspots ({publicReports.length})
          </button>
        </div>
      </div>

      {/* Mandatory Ethical Notice */}
      <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-4 flex items-start gap-3 text-xs text-slate-300">
        <Shield className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white">Ethical & Legal Distinction:</span>{' '}
          A submitted corruption report is an <strong className="text-slate-100">allegation</strong>,
          not proof of wrongdoing. Do not name uncharged private individuals publicly. Anonymous
          reports never store user identity or IP metadata.
        </div>
      </div>

      {subTab === 'submit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-8 rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 space-y-5"
          >
            {submitError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
                {submitError}
              </div>
            )}

            {createdTrackingId && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <FileCheck2 className="h-4 w-4" />
                  Allegation Recorded Securely
                </div>
                <p className="text-xs text-slate-200">
                  Save your unique Tracking ID to check verification status updates:
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-base font-bold text-white tabular-nums">
                    {createdTrackingId}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSubTab('track');
                      handleTrackLookup(createdTrackingId);
                    }}
                    className="rounded bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                  >
                    Open Status Tracker
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Government Department
                </label>
                <select
                  required
                  value={departmentId}
                  onChange={(e) => setDepartmentId(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Corruption Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                >
                  {CORRUPTION_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Allegation Title
              </label>
              <input
                type="text"
                required
                minLength={6}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={checkDuplicatesLive}
                placeholder="e.g., Alleged irregular tender billing in road resurfacing"
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Detailed Incident Description (Factual Observations)
              </label>
              <textarea
                required
                minLength={20}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={checkDuplicatesLive}
                placeholder="Describe dates, tender or reference numbers, and observed irregularities without publishing personal home addresses or defamatory claims."
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            {duplicates.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  Potential Duplicate Allegations Detected
                </div>
                <div className="space-y-1.5 text-xs text-slate-200">
                  {duplicates.map((d) => (
                    <div key={d.reference_code} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-mono text-cyan-300">{d.reference_code}</span> ·{' '}
                        {d.title}
                      </span>
                      <span className="font-mono text-amber-300 tabular-nums">
                        {Math.round(d.similarity_score * 100)}% match
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                General Location (Ward / Locality / City)
              </label>
              <input
                type="text"
                required
                value={generalLocation}
                onChange={(e) => setGeneralLocation(e.target.value)}
                className="mb-3 w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
              <LocationPicker
                latitude={lat}
                longitude={lng}
                locationLabel={generalLocation}
                onSelectLocation={(loc) => {
                  setLat(loc.lat);
                  setLng(loc.lng);
                  setGeneralLocation(loc.address);
                  setCity(loc.city);
                  setStateName(loc.state);
                }}
                generalizeNote="Privacy Safeguard: Coordinates are automatically generalized to a ~1.1km grid before saving."
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Supporting Evidence (Optional — Stored in Private Vault)
              </label>
              <label className="flex items-center justify-between rounded-lg border border-dashed border-[#1E2D4A] bg-[#070D1A] px-4 py-3 text-xs text-slate-300 hover:border-cyan-500/40 cursor-pointer">
                <span className="inline-flex items-center gap-2">
                  <Upload className="h-4 w-4 text-cyan-400" />
                  {evidenceFile ? evidenceFile.name : 'Upload PDF, JPG, PNG, WEBP, or TXT (Max 5MB)'}
                </span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.txt"
                  onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {evidenceFile && (
                  <span className="font-mono text-cyan-400 tabular-nums">
                    {(evidenceFile.size / 1024).toFixed(1)} KB
                  </span>
                )}
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <label className="flex items-start gap-2.5 rounded-lg border border-[#1E2D4A] bg-[#070D1A] p-3.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="mt-0.5 accent-cyan-400"
                />
                <div className="text-xs">
                  <div className="font-semibold text-white">Submit Anonymously</div>
                  <div className="text-slate-400 mt-0.5">
                    Detaches your account ID and redacts IP metadata permanently.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-lg border border-[#1E2D4A] bg-[#070D1A] p-3.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isConfidential}
                  onChange={(e) => setIsConfidential(e.target.checked)}
                  className="mt-0.5 accent-cyan-400"
                />
                <div className="text-xs">
                  <div className="font-semibold text-white">Confidential Oversight Only</div>
                  <div className="text-slate-400 mt-0.5">
                    Restricts details to authorized admins and keeps off public hotspot maps.
                  </div>
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Encrypting & Logging Report...' : 'Submit Corruption Allegation'}
            </button>
          </form>

          {/* Right Column: User's non-anonymous filings & workflow overview */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5 space-y-3">
              <h2 className="font-display text-base font-semibold text-white">
                Verification Workflow
              </h2>
              <ol className="space-y-2 text-xs text-slate-300">
                {WORKFLOW_STEPS.map((step, i) => (
                  <li key={step} className="flex items-center gap-2.5">
                    <span className="font-mono text-[11px] text-cyan-400 tabular-nums">
                      0{i + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {user && (
              <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5 space-y-3">
                <h2 className="font-display text-base font-semibold text-white">
                  Your Linked Reports ({myReports.length})
                </h2>
                {myReports.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No account-linked reports yet. Anonymous submissions remain unlinked for your
                    protection.
                  </p>
                ) : (
                  <div className="divide-y divide-[#1E2D4A]">
                    {myReports.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setSubTab('track');
                          setTrackInput(r.tracking_id);
                          handleTrackLookup(r.tracking_id);
                        }}
                        className="w-full py-3 text-left hover:bg-[#131F38] px-2 rounded transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-cyan-400">{r.tracking_id}</span>
                          <span className={getStatusColorClass(r.status)}>{r.status}</span>
                        </div>
                        <div className="mt-1 text-xs font-medium text-white">{r.title}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'track' && (
        <div className="space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleTrackLookup();
            }}
            className="flex flex-col sm:flex-row gap-3 rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={trackInput}
                onChange={(e) => setTrackInput(e.target.value)}
                placeholder="Enter Tracking ID (e.g., PCM-CR-2026-1041)"
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] pl-9 pr-4 py-2.5 font-mono text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
            >
              Track Report
            </button>
          </form>

          {trackError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300">
              {trackError}
            </div>
          )}

          {trackedData && (
            <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2D4A] pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                    <span>{trackedData.report.tracking_id}</span>
                    <span className="text-slate-600">/</span>
                    <span>{trackedData.report.category}</span>
                    {trackedData.report.is_confidential && (
                      <>
                        <span className="text-slate-600">/</span>
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Lock className="h-3 w-3" /> Confidential
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="mt-1.5 font-display text-xl font-semibold text-white">
                    {trackedData.report.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {trackedData.report.department_name} · {trackedData.report.general_location}
                  </p>
                </div>

                <div className="text-right">
                  <div className={`text-sm font-semibold ${getStatusColorClass(trackedData.report.status)}`}>
                    {trackedData.report.status}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {trackedData.report.verification_label}
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed">
                {trackedData.report.description}
              </p>

              {/* Progress Steps */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {WORKFLOW_STEPS.map((step, idx) => {
                  const activeIdx = WORKFLOW_STEPS.indexOf(trackedData.report.status);
                  const reached = idx <= activeIdx;
                  return (
                    <div
                      key={step}
                      className={`rounded-lg border p-3 text-xs ${
                        reached
                          ? 'border-cyan-500/50 bg-cyan-500/10 text-white'
                          : 'border-[#1E2D4A] bg-[#070D1A] text-slate-500'
                      }`}
                    >
                      <div className="font-mono text-[10px] text-cyan-400">0{idx + 1}</div>
                      <div className="mt-1 font-medium leading-tight">{step}</div>
                    </div>
                  );
                })}
              </div>

              {/* Status History */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-3">Status Audit History</h3>
                <div className="divide-y divide-[#1E2D4A] rounded-lg border border-[#1E2D4A] bg-[#070D1A]">
                  {trackedData.history.map((h, i) => (
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

              {trackedData.evidence.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-300 mb-2">
                    Private Evidence Files (Authorized Access Only)
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {trackedData.evidence.map((ev) => (
                      <a
                        key={ev.id}
                        href={`/api/evidence/${ev.id}`}
                        className="rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-xs text-cyan-300 hover:border-cyan-500/40"
                      >
                        {ev.original_filename} ({(ev.file_size / 1024).toFixed(1)} KB)
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {subTab === 'public' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {publicReports.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-cyan-400">{r.tracking_id}</span>
                  <span className={getStatusColorClass(r.status)}>{r.status}</span>
                </div>
                <h3 className="font-display text-base font-semibold text-white">{r.title}</h3>
                <div className="text-xs text-slate-400">
                  {r.category} · {r.department_name} · {r.general_location}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{r.description}</p>
              </div>
              <div className="flex items-center justify-between border-t border-[#1E2D4A] pt-3 text-[11px] text-slate-400">
                <span>{r.verification_label}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSubTab('track');
                    setTrackInput(r.tracking_id);
                    handleTrackLookup(r.tracking_id);
                  }}
                  className="font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  Inspect Timeline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
