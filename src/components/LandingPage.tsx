import L from 'leaflet';
import { ArrowRight, BarChart3, CalendarCheck, FileWarning, MapPin, Shield } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ActiveTab, AnalyticsPayload, ProtestEvent, User } from '../types';

interface LandingPageProps {
  analytics: AnalyticsPayload | null;
  previewEvents: ProtestEvent[];
  user: User | null;
  onNavigate: (tab: ActiveTab) => void;
  onOpenAuth: () => void;
}

export function LandingPage({
  analytics,
  previewEvents,
  user,
  onNavigate,
  onOpenAuth,
}: LandingPageProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    const map = L.map(mapRef.current, {
      center: [18.5204, 73.8567],
      zoom: 12,
      zoomControl: false,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 18,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    leafletRef.current = map;

    return () => {
      map.remove();
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = leafletRef.current;
    if (!map) return;

    const layerGroup = L.layerGroup().addTo(map);
    previewEvents.slice(0, 8).forEach((ev) => {
      const marker = L.circleMarker([ev.latitude, ev.longitude], {
        radius: 8,
        color: '#22d3ee',
        fillColor: ev.status === 'Active' ? '#06b6d4' : '#3b82f6',
        fillOpacity: 0.85,
        weight: 2,
      }).addTo(layerGroup);

      marker.bindPopup(
        `<div class="text-xs space-y-1">
          <div class="font-semibold text-white">${ev.title}</div>
          <div class="text-slate-400">${ev.public_location}</div>
          <div class="text-cyan-400">${ev.verification_label}</div>
        </div>`
      );
    });

    return () => {
      layerGroup.remove();
    };
  }, [previewEvents]);

  const kpis = analytics?.kpis;

  return (
    <div className="bg-[#070D1A]">
      {/* Hero Section */}
      <section className="mx-auto max-w-[1440px] px-4 sm:px-6 pt-12 pb-16 lg:pt-16 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between space-y-8">
            <div className="space-y-5">
              <p className="text-xs font-medium tracking-wider text-cyan-400 uppercase">
                Public Accountability & Civic Coordination · Pune & Pan-India
              </p>
              <h1
                className="font-display font-bold tracking-tight text-white leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 3.6vw, 3.5rem)', textWrap: 'balance' }}
              >
                Protest & Corruption Manager
              </h1>
              <p className="text-lg font-medium text-cyan-300">
                Report. Track. Participate. Create Change.
              </p>
              <p className="max-w-xl text-base text-slate-300 leading-relaxed">
                An ethical civic-tech workspace uniting confidential corruption allegation intake,
                municipal complaint tracking, verified peaceful assembly coordination, and a
                real-time OpenStreetMap accountability atlas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('map')}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer"
              >
                Open Real-Time Civic Map
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('corruption')}
                className="inline-flex items-center gap-2 rounded-lg border border-[#1E2D4A] bg-[#0D1629] px-5 py-3 text-sm font-medium text-white hover:border-cyan-500/40 hover:bg-[#131F38] transition-colors cursor-pointer"
              >
                Submit Allegation Report
              </button>
              {!user && (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  Citizen & Organizer Sign In
                </button>
              )}
            </div>
          </div>

          {/* Interactive Live Map Preview */}
          <div className="lg:col-span-6 flex flex-col rounded-xl border border-[#1E2D4A] bg-[#0D1629] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#1E2D4A] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <MapPin className="h-4 w-4 text-cyan-400" />
                <span className="font-medium text-white">Live Map Preview</span>
                <span className="text-slate-500">·</span>
                <span>Pune Initial Region</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('map')}
                className="text-xs font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Full-Screen Map
              </button>
            </div>
            <div ref={mapRef} className="min-h-[300px] lg:flex-1 w-full" />
            <div className="border-t border-[#1E2D4A] px-4 py-2.5 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <span>Moderated public events & generalized civic layers only</span>
              <span className="font-mono text-slate-300 tabular-nums">
                {previewEvents.length} verified events plotted
              </span>
            </div>
          </div>
        </div>

        {/* Live Database KPI Strip */}
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5">
            <div className="text-xs text-slate-400">Corruption Reports Logged</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white tabular-nums">
              {kpis ? kpis.total_corruption_reports : '—'}
            </div>
            <div className="mt-1 text-xs text-cyan-400 tabular-nums">
              {kpis ? `${kpis.verified_reports} verified for action` : 'Loading metrics'}
            </div>
          </div>
          <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5">
            <div className="text-xs text-slate-400">Civic Complaints Tracked</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white tabular-nums">
              {kpis ? kpis.total_complaints : '—'}
            </div>
            <div className="mt-1 text-xs text-emerald-400 tabular-nums">
              {kpis ? `${kpis.resolved_complaints} resolved` : 'Loading metrics'}
            </div>
          </div>
          <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5">
            <div className="text-xs text-slate-400">Verified Peaceful Events</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white tabular-nums">
              {kpis ? kpis.active_protests + kpis.upcoming_events : '—'}
            </div>
            <div className="mt-1 text-xs text-cyan-400 tabular-nums">
              {kpis ? `${kpis.active_protests} active · ${kpis.upcoming_events} upcoming` : 'Loading'}
            </div>
          </div>
          <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5">
            <div className="text-xs text-slate-400">Registered Volunteers</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white tabular-nums">
              {kpis ? kpis.total_volunteers : '—'}
            </div>
            <div className="mt-1 text-xs text-slate-400">Across verified assemblies</div>
          </div>
        </div>
      </section>

      {/* Core Civic Mechanisms */}
      <section className="border-t border-[#1E2D4A] bg-[#091122] py-16">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              Structured Workflows Built Around Civic Ethics
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
              Every submission follows transparent moderation, identity protection, and verifiable
              attribution before appearing publicly.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 flex flex-col justify-between">
              <div>
                <FileWarning className="h-6 w-6 text-cyan-400" />
                <h3 className="mt-4 font-display text-lg font-semibold text-white">
                  01. Corruption Allegation Intake
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Report suspected bribery, procurement fraud, or fund misuse confidentially or
                  anonymously. Unique tracking IDs preserve audit trails while protecting
                  whistleblower identity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('corruption')}
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Report or Track Allegation
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 flex flex-col justify-between">
              <div>
                <CalendarCheck className="h-6 w-6 text-cyan-400" />
                <h3 className="mt-4 font-display text-lg font-semibold text-white">
                  02. Peaceful Protest Coordination
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Organizers submit lawful civic assemblies for moderator verification, publish
                  safety announcements, and coordinate volunteers without tracking individual GPS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('protests')}
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Explore Verified Events
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 flex flex-col justify-between">
              <div>
                <BarChart3 className="h-6 w-6 text-cyan-400" />
                <h3 className="mt-4 font-display text-lg font-semibold text-white">
                  03. Civic Complaints & Analytics
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Log local infrastructure, water, road, and sanitation issues with automatic
                  duplicate detection, department assignment, and live Chart.js accountability trends.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('analytics')}
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                View Transparency Analytics
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Ethical Standards Panel */}
          <div className="mt-10 rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
              <div className="space-y-3">
                <h3 className="font-display text-base font-semibold text-white">
                  Ethical & Legal Safeguards Charter
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-300 leading-relaxed">
                  <div>
                    <span className="font-semibold text-white">Allegation vs. Proof:</span>{' '}
                    Corruption filings represent unverified allegations undergoing review—never
                    automated findings of guilt.
                  </div>
                  <div>
                    <span className="font-semibold text-white">Identity Protection:</span>{' '}
                    Anonymous submissions unlink user identity at database write time; private
                    evidence stays encrypted off public routes.
                  </div>
                  <div>
                    <span className="font-semibold text-white">No Individual Tracking:</span>{' '}
                    PCM never tracks protester or complainant live GPS; map hotspots use ~1.1km
                    generalization and &ge;2 threshold heatmaps.
                  </div>
                  <div>
                    <span className="font-semibold text-white">Verified Moderation:</span>{' '}
                    All public events and map hotspots pass administrator review with clear
                    verification and source attribution labels.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-[#1E2D4A] bg-[#070D1A] py-8">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            <span className="font-semibold text-white">Protest & Corruption Manager (PCM)</span>
            <span className="mx-2 text-slate-600">·</span>
            <span>Report. Track. Participate. Create Change.</span>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => onNavigate('map')} className="hover:text-white cursor-pointer">
              Live Map
            </button>
            <button type="button" onClick={() => onNavigate('complaints')} className="hover:text-white cursor-pointer">
              Complaints
            </button>
            <button type="button" onClick={() => onNavigate('analytics')} className="hover:text-white cursor-pointer">
              Analytics
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
