import { Calendar, Megaphone, Plus, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost, formatDateTime, getStatusColorClass } from '../lib/api';
import type { ProtestEvent, User } from '../types';
import { LocationPicker } from './LocationPicker';

interface ProtestsModuleProps {
  user: User | null;
  onOpenAuth: () => void;
  initialEventCode?: string | null;
}

const EVENT_CATEGORIES = [
  'Civic Accountability',
  'Environmental Protection',
  'Infrastructure & Safety',
  'Public Budget & Transparency',
  'Labor & Community Rights',
  'Peaceful Vigil',
];

export function ProtestsModule({ user, onOpenAuth, initialEventCode }: ProtestsModuleProps) {
  const [events, setEvents] = useState<ProtestEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ProtestEvent | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(EVENT_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [publicLocation, setPublicLocation] = useState('Bal Gandharva Chowk, JM Road, Pune');
  const [city, setCity] = useState('Pune');
  const [stateName, setStateName] = useState('Maharashtra');
  const [lat, setLat] = useState(18.5204);
  const [lng, setLng] = useState(73.8442);
  const [startTime, setStartTime] = useState(() => {
    const d = new Date(Date.now() + 86400000 * 3);
    return d.toISOString().slice(0, 16);
  });
  const [endTime, setEndTime] = useState(() => {
    const d = new Date(Date.now() + 86400000 * 3 + 7200000);
    return d.toISOString().slice(0, 16);
  });
  const [expectedParticipants, setExpectedParticipants] = useState(100);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);

  // Volunteer form
  const [volRole, setVolRole] = useState('First Aid & Hydration Desk');
  const [volNotes, setVolNotes] = useState('');

  // Organizer announcement form
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');

  async function loadEvents() {
    const qs = categoryFilter !== 'all' ? `?category=${encodeURIComponent(categoryFilter)}` : '';
    const res = await apiGet<{ events: ProtestEvent[] }>(`/api/events${qs}`);
    const list = res.events || [];
    setEvents(list);
    if (initialEventCode) {
      const match = list.find((e) => e.event_code === initialEventCode);
      if (match) setSelectedEvent(match);
    } else if (selectedEvent) {
      const updated = list.find((e) => e.id === selectedEvent.id);
      if (updated) setSelectedEvent(updated);
    }
  }

  useEffect(() => {
    loadEvents();
  }, [categoryFilter, user]);

  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateNotice(null);
    try {
      const res = await apiPost<{ event_code: string; status: string }>('/api/events', {
        title,
        category,
        description,
        public_location: publicLocation,
        city,
        state: stateName,
        latitude: lat,
        longitude: lng,
        start_time: startTime.replace('T', ' ') + ':00',
        end_time: endTime.replace('T', ' ') + ':00',
        expected_participants: expectedParticipants,
      });
      setCreateNotice(
        `Event ${res.event_code} created with status "${res.status}". Public display activates upon moderator approval.`
      );
      setTitle('');
      setDescription('');
      setShowCreateForm(false);
      await loadEvents();
    } catch (err) {
      setCreateError((err as Error).message);
    }
  }

  async function handleVolunteerRegister(eventId: number) {
    if (!user) {
      onOpenAuth();
      return;
    }
    await apiPost(`/api/events/${eventId}/volunteer`, {
      role_preference: volRole,
      availability_notes: volNotes,
    });
    setVolNotes('');
    await loadEvents();
  }

  async function handleVolunteerCancel(eventId: number) {
    await apiDelete(`/api/events/${eventId}/volunteer`);
    await loadEvents();
  }

  async function handlePublishAnnouncement(e: FormEvent, eventId: number) {
    e.preventDefault();
    await apiPost(`/api/events/${eventId}/announcements`, {
      title: annTitle,
      content: annContent,
      is_pinned: true,
    });
    setAnnTitle('');
    setAnnContent('');
    await loadEvents();
  }

  async function handleOrganizerStatus(eventId: number, status: string) {
    await apiPatch(`/api/events/${eventId}/status`, { status });
    await loadEvents();
  }

  const canOrganize = user?.role === 'organizer' || user?.role === 'admin';

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#1E2D4A] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Peaceful Protests & Civic Assemblies
          </h1>
          <p className="mt-1.5 text-sm text-slate-300 max-w-3xl">
            Discover moderated peaceful public events, receive verified organizer announcements,
            and register as a community volunteer. Individual participant locations are never tracked.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start">
          {canOrganize ? (
            <button
              type="button"
              onClick={() => setShowCreateForm((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              {showCreateForm ? 'Close Event Form' : 'Announce Peaceful Event'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="rounded-lg border border-[#1E2D4A] bg-[#0D1629] px-4 py-2.5 text-xs font-medium text-cyan-300 hover:border-cyan-500/40 cursor-pointer whitespace-nowrap"
            >
              Sign in as Organizer to Create Events
            </button>
          )}
        </div>
      </div>

      {createNotice && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-300">
          {createNotice}
        </div>
      )}

      {showCreateForm && canOrganize && (
        <form
          onSubmit={handleCreateEvent}
          className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-[#1E2D4A] pb-3">
            <h2 className="font-display text-lg font-semibold text-white">
              Submit Peaceful Public Event for Moderation
            </h2>
            <span className="text-xs text-slate-400">Lawful & non-violent assemblies only</span>
          </div>

          {createError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              {createError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Event Title</label>
              <input
                type="text"
                required
                minLength={6}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Ward 11 Public Budget Transparency Dialogue"
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
              >
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Public Purpose & Peaceful Conduct Guidelines
            </label>
            <textarea
              required
              minLength={20}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Start Time</label>
              <input
                type="datetime-local"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">End Time</label>
              <input
                type="datetime-local"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Expected Participants
              </label>
              <input
                type="number"
                min={5}
                value={expectedParticipants}
                onChange={(e) => setExpectedParticipants(Number(e.target.value))}
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-2 text-sm text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Public Assembly Location
            </label>
            <input
              type="text"
              required
              value={publicLocation}
              onChange={(e) => setPublicLocation(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3.5 py-2 text-sm text-white"
            />
            <LocationPicker
              latitude={lat}
              longitude={lng}
              locationLabel={publicLocation}
              onSelectLocation={(loc) => {
                setLat(loc.lat);
                setLng(loc.lng);
                setPublicLocation(loc.address);
                setCity(loc.city);
                setStateName(loc.state);
              }}
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
          >
            Submit Event for Moderation
          </button>
        </form>
      )}

      {/* Filter Bar */}
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
          All Categories
        </button>
        {EVENT_CATEGORIES.map((c) => (
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

      {/* Event Grid + Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          {events.map((ev) => {
            const isSelected = selectedEvent?.id === ev.id;
            return (
              <div
                key={ev.id}
                onClick={() => setSelectedEvent(ev)}
                className={`rounded-xl border p-5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-cyan-500/60 bg-[#131F38]'
                    : 'border-[#1E2D4A] bg-[#0D1629] hover:border-cyan-500/30'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-cyan-400">{ev.event_code}</span>
                  <span className={getStatusColorClass(ev.status)}>{ev.status}</span>
                </div>
                <h2 className="mt-1.5 font-display text-lg font-semibold text-white">{ev.title}</h2>
                <div className="mt-1 text-xs text-slate-400">
                  {ev.category} · {ev.public_location}
                </div>
                <p className="mt-2.5 text-xs text-slate-300 leading-relaxed">{ev.description}</p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#1E2D4A] pt-3 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                    <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                    {formatDateTime(ev.start_time)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-slate-300">
                    <Users className="h-3.5 w-3.5 text-cyan-400" />
                    {ev.volunteer_count} volunteers
                  </span>
                  <span className="text-cyan-300">{ev.verification_label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Event Operations Panel */}
        <div className="lg:col-span-5">
          {selectedEvent ? (
            <div className="sticky top-20 rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 space-y-6">
              <div className="border-b border-[#1E2D4A] pb-4">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-cyan-400">{selectedEvent.event_code}</span>
                  <span className={getStatusColorClass(selectedEvent.status)}>
                    {selectedEvent.status}
                  </span>
                </div>
                <h3 className="mt-1.5 font-display text-xl font-bold text-white">
                  {selectedEvent.title}
                </h3>
                <div className="mt-1 text-xs text-slate-400">
                  Organized by {selectedEvent.organizer_org || selectedEvent.organizer_name} ·{' '}
                  {selectedEvent.source_attribution}
                </div>
              </div>

              {/* Citizen Volunteer Registration */}
              {selectedEvent.is_public === 1 && (
                <div className="space-y-3 rounded-lg border border-[#1E2D4A] bg-[#070D1A] p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-white">Volunteer Participation</h4>
                    <span className="font-mono text-xs text-cyan-400 tabular-nums">
                      {selectedEvent.volunteer_count} registered
                    </span>
                  </div>

                  {selectedEvent.my_volunteer_status &&
                  selectedEvent.my_volunteer_status !== 'Cancelled' ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-emerald-400">
                        You are registered ({selectedEvent.my_volunteer_status})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleVolunteerCancel(selectedEvent.id)}
                        className="rounded-md border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                      >
                        Cancel Registration
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <select
                        value={volRole}
                        onChange={(e) => setVolRole(e.target.value)}
                        className="w-full rounded-md border border-[#1E2D4A] bg-[#0D1629] px-3 py-2 text-xs text-white"
                      >
                        <option value="First Aid & Hydration Desk">First Aid & Hydration Desk</option>
                        <option value="Accessibility Marshall">Accessibility Marshall</option>
                        <option value="Documentation & Checklist">Documentation & Checklist</option>
                        <option value="General Support">General Support</option>
                      </select>
                      <input
                        type="text"
                        value={volNotes}
                        onChange={(e) => setVolNotes(e.target.value)}
                        placeholder="Availability notes (optional)"
                        className="w-full rounded-md border border-[#1E2D4A] bg-[#0D1629] px-3 py-2 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleVolunteerRegister(selectedEvent.id)}
                        className="w-full rounded-md bg-cyan-500 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                      >
                        {user ? 'Register as Volunteer' : 'Sign In to Volunteer'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Organizer Controls */}
              {user &&
                (user.role === 'admin' || user.id === selectedEvent.organizer_id) &&
                selectedEvent.is_public === 1 && (
                  <div className="space-y-3 rounded-lg border border-[#1E2D4A] bg-[#070D1A] p-4">
                    <div className="text-xs font-semibold text-white">Organizer Controls</div>
                    <div className="flex flex-wrap gap-2">
                      {['Scheduled', 'Active', 'Completed', 'Cancelled'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleOrganizerStatus(selectedEvent.id, st)}
                          className={`rounded px-2.5 py-1 text-xs border cursor-pointer ${
                            selectedEvent.status === st
                              ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                              : 'border-[#1E2D4A] text-slate-300 hover:text-white'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    <form
                      onSubmit={(e) => handlePublishAnnouncement(e, selectedEvent.id)}
                      className="space-y-2 pt-2 border-t border-[#1E2D4A]"
                    >
                      <input
                        type="text"
                        required
                        value={annTitle}
                        onChange={(e) => setAnnTitle(e.target.value)}
                        placeholder="Announcement headline..."
                        className="w-full rounded border border-[#1E2D4A] bg-[#0D1629] px-3 py-1.5 text-xs text-white"
                      />
                      <textarea
                        required
                        rows={2}
                        value={annContent}
                        onChange={(e) => setAnnContent(e.target.value)}
                        placeholder="Update for volunteers and attendees..."
                        className="w-full rounded border border-[#1E2D4A] bg-[#0D1629] px-3 py-1.5 text-xs text-white"
                      />
                      <button
                        type="submit"
                        className="rounded bg-[#131F38] border border-cyan-500/40 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/10 cursor-pointer"
                      >
                        Publish Announcement
                      </button>
                    </form>
                  </div>
                )}

              {/* Announcements Feed */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Megaphone className="h-3.5 w-3.5 text-cyan-400" />
                  Event Announcements ({selectedEvent.announcements?.length || 0})
                </div>
                {!selectedEvent.announcements || selectedEvent.announcements.length === 0 ? (
                  <p className="text-xs text-slate-400">No organizer announcements posted yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEvent.announcements.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg border border-[#1E2D4A] bg-[#070D1A] p-3 text-xs space-y-1"
                      >
                        <div className="font-semibold text-white">{a.title}</div>
                        <p className="text-slate-300 leading-relaxed">{a.content}</p>
                        <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {a.author_name} · {formatDateTime(a.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-8 text-center text-xs text-slate-400">
              Select an event from the list to inspect verification status, read organizer
              announcements, or register as a volunteer.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
