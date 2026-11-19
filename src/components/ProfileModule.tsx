import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPatch, formatDateTime, getStatusColorClass } from '../lib/api';
import type { User } from '../types';

interface ProfileModuleProps {
  user: User;
  onUpdated: (user: User) => void;
}

export function ProfileModule({ user, onUpdated }: ProfileModuleProps) {
  const [fullName, setFullName] = useState(user.full_name);
  const [city, setCity] = useState(user.city);
  const [orgName, setOrgName] = useState(user.organization_name || '');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [volunteers, setVolunteers] = useState<
    Array<{
      id: number;
      event_code: string;
      event_title: string;
      public_location: string;
      start_time: string;
      role_preference: string;
      status: string;
    }>
  >([]);

  useEffect(() => {
    apiGet<{ registrations: typeof volunteers }>('/api/volunteers/mine')
      .then((res) => setVolunteers(res.registrations || []))
      .catch(() => setVolunteers([]));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSavedNotice(null);
    const res = await apiPatch<{ user: User }>('/api/auth/profile', {
      full_name: fullName,
      city,
      organization_name: orgName,
    });
    onUpdated(res.user);
    setSavedNotice('Profile settings saved.');
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
      <form
        onSubmit={handleSave}
        className="lg:col-span-5 rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 space-y-4 self-start"
      >
        <div className="border-b border-[#1E2D4A] pb-3">
          <h1 className="font-display text-xl font-bold text-white">Account Profile</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {user.email} · Role: <span className="capitalize text-cyan-400">{user.role}</span>
          </p>
        </div>

        {savedNotice && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            {savedNotice}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">Full Name</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Organization (Optional)
          </label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-cyan-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
        >
          Save Profile
        </button>
      </form>

      <div className="lg:col-span-7 rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold text-white">
          Your Volunteer Registrations
        </h2>
        {volunteers.length === 0 ? (
          <p className="text-xs text-slate-400">
            You have not registered for any public events yet.
          </p>
        ) : (
          <div className="divide-y divide-[#1E2D4A]">
            {volunteers.map((v) => (
              <div key={v.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-mono text-cyan-400">{v.event_code}</div>
                  <div className="font-semibold text-white mt-0.5">{v.event_title}</div>
                  <div className="text-slate-400 mt-0.5">
                    {v.role_preference} · {v.public_location} · {formatDateTime(v.start_time)}
                  </div>
                </div>
                <span className={`font-semibold ${getStatusColorClass(v.status)}`}>{v.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
