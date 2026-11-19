import L from 'leaflet';
import 'leaflet.markercluster';
import {
  Clock,
  Compass,
  Filter,
  Layers,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, formatDateTime, getStatusColorClass } from '../lib/api';
import type { ActiveTab, GeocodeResult } from '../types';

interface MapEventItem {
  id: number;
  code: string;
  title: string;
  category: string;
  description: string;
  location: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  event_date: string;
  status: string;
  verification_label: string;
  source_attribution: string;
  updated_at: string;
  volunteer_count?: number;
}

interface MapComplaintItem {
  id: number;
  code: string;
  title: string;
  category: string;
  description: string;
  location: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  reported_date: string;
  status: string;
  verification_label: string;
  source_attribution: string;
  updated_at: string;
  department_name?: string;
}

interface MapHotspotItem {
  id: number;
  code: string;
  title: string;
  category: string;
  description: string;
  location: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  reported_date: string;
  status: string;
  verification_label: string;
  source_attribution: string;
  updated_at: string;
  department_name?: string;
}

interface HeatmapCell {
  lat: number;
  lng: number;
  count: number;
  city: string;
}

interface TimelineEntry {
  item_type: 'event' | 'complaint' | 'hotspot';
  id: number;
  code: string;
  title: string;
  category: string;
  location: string;
  status: string;
  verification_label: string;
  source_attribution: string;
  updated_at: string;
}

interface ExternalSource {
  id: number;
  source_name: string;
  source_url: string;
  license_type: string;
  attribution_text: string;
}

interface LiveMapPageProps {
  socketConnected: boolean;
  lastRealtimeUpdate: { type: string; timestamp: string } | null;
  onNavigateToDetail: (tab: ActiveTab, code?: string) => void;
}

export function LiveMapPage({
  socketConnected,
  lastRealtimeUpdate,
  onNavigateToDetail,
}: LiveMapPageProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupsRef = useRef<{
    events: L.MarkerClusterGroup;
    hotspots: L.MarkerClusterGroup;
    complaints: L.MarkerClusterGroup;
    heatmap: L.LayerGroup;
  } | null>(null);
  const markerLookupRef = useRef<Map<string, L.CircleMarker>>(new Map());

  const [events, setEvents] = useState<MapEventItem[]>([]);
  const [complaints, setComplaints] = useState<MapComplaintItem[]>([]);
  const [hotspots, setHotspots] = useState<MapHotspotItem[]>([]);
  const [heatmapCells, setHeatmapCells] = useState<HeatmapCell[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [sources, setSources] = useState<ExternalSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Layer toggles
  const [layers, setLayers] = useState({
    events: true,
    hotspots: true,
    complaints: true,
    heatmap: false,
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sidebarMode, setSidebarMode] = useState<'list' | 'timeline' | 'sources'>('list');
  const [geoResults, setGeoResults] = useState<GeocodeResult[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const loadMapData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (searchQuery.trim()) qs.set('q', searchQuery.trim());
      if (categoryFilter !== 'all') qs.set('category', categoryFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (dateFrom) qs.set('from', dateFrom);
      if (dateTo) qs.set('to', dateTo);
      const qStr = qs.toString() ? `?${qs.toString()}` : '';

      const [evRes, cmpRes, hotRes, heatRes, timeRes, srcRes] = await Promise.all([
        apiGet<{ events: MapEventItem[] }>(`/api/map/events${qStr}`),
        apiGet<{ complaints: MapComplaintItem[] }>(`/api/map/complaints${qStr}`),
        apiGet<{ hotspots: MapHotspotItem[] }>(`/api/map/hotspots${qStr}`),
        apiGet<{ cells: HeatmapCell[] }>('/api/map/heatmap'),
        apiGet<{ timeline: TimelineEntry[] }>('/api/map/timeline'),
        apiGet<{ sources: ExternalSource[] }>('/api/map/sources'),
      ]);

      setEvents(evRes.events || []);
      setComplaints(cmpRes.complaints || []);
      setHotspots(hotRes.hotspots || []);
      setHeatmapCells(heatRes.cells || []);
      setTimeline(timeRes.timeline || []);
      setSources(srcRes.sources || []);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, categoryFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadMapData();
  }, [loadMapData]);

  // Refresh smoothly without page reload whenever a WebSocket update arrives
  useEffect(() => {
    if (lastRealtimeUpdate) {
      loadMapData();
    }
  }, [lastRealtimeUpdate, loadMapData]);

  // Initialize Leaflet Map (Pune initial demonstration region)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [18.5204, 73.8567],
      zoom: 12,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const eventsCluster = L.markerClusterGroup({ chunkedLoading: true });
    const hotspotsCluster = L.markerClusterGroup({ chunkedLoading: true });
    const complaintsCluster = L.markerClusterGroup({ chunkedLoading: true });
    const heatmapGroup = L.layerGroup();

    map.addLayer(eventsCluster);
    map.addLayer(hotspotsCluster);
    map.addLayer(complaintsCluster);

    mapRef.current = map;
    clusterGroupsRef.current = {
      events: eventsCluster,
      hotspots: hotspotsCluster,
      complaints: complaintsCluster,
      heatmap: heatmapGroup,
    };

    return () => {
      map.remove();
      mapRef.current = null;
      clusterGroupsRef.current = null;
    };
  }, []);

  // Sync markers and layer visibility
  useEffect(() => {
    const map = mapRef.current;
    const groups = clusterGroupsRef.current;
    if (!map || !groups) return;

    groups.events.clearLayers();
    groups.hotspots.clearLayers();
    groups.complaints.clearLayers();
    groups.heatmap.clearLayers();
    markerLookupRef.current.clear();

    const createPopupHtml = (item: {
      code: string;
      title: string;
      category: string;
      location: string;
      dateLabel: string;
      status: string;
      verification: string;
      updated: string;
      description: string;
      source: string;
      tab: ActiveTab;
      extraNote?: string;
    }) => {
      const container = document.createElement('div');
      container.className = 'space-y-2 text-xs';
      container.innerHTML = `
        <div class="flex items-center justify-between gap-2 text-[11px] font-mono text-cyan-400">
          <span>${item.code}</span>
          <span>${item.status}</span>
        </div>
        <div class="font-semibold text-sm text-white leading-snug">${item.title}</div>
        <div class="text-slate-300">${item.category} · ${item.location}</div>
        <div class="text-slate-400 leading-relaxed">${item.description.slice(0, 150)}${
          item.description.length > 150 ? '...' : ''
        }</div>
        <div class="border-t border-[#1E2D4A] pt-2 space-y-1 text-[11px] text-slate-400">
          <div><strong class="text-slate-200">Verification:</strong> ${item.verification}</div>
          <div><strong class="text-slate-200">Date:</strong> ${item.dateLabel}</div>
          <div><strong class="text-slate-200">Last Updated:</strong> ${item.updated}</div>
          <div><strong class="text-slate-200">Source:</strong> ${item.source}</div>
          ${item.extraNote ? `<div class="text-amber-300">${item.extraNote}</div>` : ''}
        </div>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'View Full Record Details';
      btn.className =
        'mt-2 w-full rounded bg-cyan-500 px-3 py-1.5 text-center text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer';
      btn.onclick = () => onNavigateToDetail(item.tab, item.code);
      container.appendChild(btn);
      return container;
    };

    events.forEach((ev) => {
      const marker = L.circleMarker([ev.latitude, ev.longitude], {
        radius: 9,
        color: '#22d3ee',
        fillColor: ev.status === 'Active' ? '#06b6d4' : '#3b82f6',
        fillOpacity: 0.9,
        weight: 2,
      });
      marker.bindPopup(
        createPopupHtml({
          code: ev.code,
          title: ev.title,
          category: ev.category,
          location: ev.location,
          dateLabel: formatDateTime(ev.event_date),
          status: ev.status,
          verification: ev.verification_label,
          updated: formatDateTime(ev.updated_at),
          description: ev.description,
          source: ev.source_attribution,
          tab: 'protests',
        })
      );
      groups.events.addLayer(marker);
      markerLookupRef.current.set(ev.code, marker);
    });

    hotspots.forEach((hp) => {
      const marker = L.circleMarker([hp.latitude, hp.longitude], {
        radius: 10,
        color: '#f59e0b',
        fillColor: '#d97706',
        fillOpacity: 0.78,
        weight: 2,
      });
      marker.bindPopup(
        createPopupHtml({
          code: hp.code,
          title: hp.title,
          category: hp.category,
          location: hp.location,
          dateLabel: formatDateTime(hp.reported_date),
          status: hp.status,
          verification: hp.verification_label,
          updated: formatDateTime(hp.updated_at),
          description: hp.description,
          source: hp.source_attribution,
          tab: 'corruption',
          extraNote:
            'Generalized ~1.1km area. Allegation under verification — not proof of wrongdoing.',
        })
      );
      groups.hotspots.addLayer(marker);
      markerLookupRef.current.set(hp.code, marker);
    });

    complaints.forEach((cmp) => {
      const isResolved = cmp.status === 'Resolved' || cmp.status === 'Closed';
      const marker = L.circleMarker([cmp.latitude, cmp.longitude], {
        radius: 7,
        color: isResolved ? '#10b981' : '#60a5fa',
        fillColor: isResolved ? '#059669' : '#2563eb',
        fillOpacity: 0.85,
        weight: 2,
      });
      marker.bindPopup(
        createPopupHtml({
          code: cmp.code,
          title: cmp.title,
          category: cmp.category,
          location: cmp.location,
          dateLabel: formatDateTime(cmp.reported_date),
          status: cmp.status,
          verification: cmp.verification_label,
          updated: formatDateTime(cmp.updated_at),
          description: cmp.description,
          source: cmp.source_attribution,
          tab: 'complaints',
        })
      );
      groups.complaints.addLayer(marker);
      markerLookupRef.current.set(cmp.code, marker);
    });

    heatmapCells.forEach((cell) => {
      const circle = L.circle([cell.lat, cell.lng], {
        radius: 900 + cell.count * 280,
        color: '#06b6d4',
        weight: 1,
        opacity: 0.45,
        fillColor: cell.count >= 4 ? '#f59e0b' : '#06b6d4',
        fillOpacity: Math.min(0.45, 0.14 + cell.count * 0.06),
      });
      circle.bindPopup(
        `<div class="text-xs space-y-1">
          <div class="font-semibold text-white">Aggregated Civic Activity Cluster</div>
          <div class="text-slate-300">Region: ${cell.city}</div>
          <div class="text-cyan-400 font-mono">Count: ${cell.count} verified items (min threshold ≥ 2)</div>
        </div>`
      );
      groups.heatmap.addLayer(circle);
    });

    if (layers.events) map.addLayer(groups.events);
    else map.removeLayer(groups.events);

    if (layers.hotspots) map.addLayer(groups.hotspots);
    else map.removeLayer(groups.hotspots);

    if (layers.complaints) map.addLayer(groups.complaints);
    else map.removeLayer(groups.complaints);

    if (layers.heatmap) map.addLayer(groups.heatmap);
    else map.removeLayer(groups.heatmap);
  }, [events, hotspots, complaints, heatmapCells, layers, onNavigateToDetail]);

  const combinedList = useMemo(() => {
    const list: Array<{
      kind: 'event' | 'hotspot' | 'complaint';
      code: string;
      title: string;
      category: string;
      location: string;
      status: string;
      verification: string;
      lat: number;
      lng: number;
      updated: string;
    }> = [];

    if (layers.events) {
      events.forEach((e) =>
        list.push({
          kind: 'event',
          code: e.code,
          title: e.title,
          category: e.category,
          location: e.location,
          status: e.status,
          verification: e.verification_label,
          lat: e.latitude,
          lng: e.longitude,
          updated: e.updated_at,
        })
      );
    }
    if (layers.hotspots) {
      hotspots.forEach((h) =>
        list.push({
          kind: 'hotspot',
          code: h.code,
          title: h.title,
          category: h.category,
          location: h.location,
          status: h.status,
          verification: h.verification_label,
          lat: h.latitude,
          lng: h.longitude,
          updated: h.updated_at,
        })
      );
    }
    if (layers.complaints) {
      complaints.forEach((c) =>
        list.push({
          kind: 'complaint',
          code: c.code,
          title: c.title,
          category: c.category,
          location: c.location,
          status: c.status,
          verification: c.verification_label,
          lat: c.latitude,
          lng: c.longitude,
          updated: c.updated_at,
        })
      );
    }

    return list;
  }, [events, hotspots, complaints, layers]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.category));
    hotspots.forEach((h) => set.add(h.category));
    complaints.forEach((c) => set.add(c.category));
    return Array.from(set).sort();
  }, [events, hotspots, complaints]);

  function focusMarker(code: string, lat: number, lng: number) {
    setSelectedCode(code);
    const map = mapRef.current;
    if (!map) return;
    map.setView([lat, lng], 15, { animate: true });
    const marker = markerLookupRef.current.get(code);
    if (marker) {
      setTimeout(() => marker.openPopup(), 250);
    }
  }

  async function jumpToPlace() {
    if (searchQuery.trim().length < 3) return;
    try {
      const data = await apiGet<{ results: GeocodeResult[] }>(
        `/api/geocode?q=${encodeURIComponent(searchQuery.trim())}`
      );
      setGeoResults(data.results || []);
    } catch {
      setGeoResults([]);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#070D1A]">
      {/* Top Map Control & Filter Toolbar */}
      <div className="border-b border-[#1E2D4A] bg-[#0D1629] px-4 py-3">
        <div className="mx-auto max-w-[1440px] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') jumpToPlace();
                }}
                placeholder="Search Pune or India location..."
                className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] pl-9 pr-3 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={jumpToPlace}
              className="rounded-lg border border-[#1E2D4A] bg-[#131F38] px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-[#1a2b4d] cursor-pointer whitespace-nowrap"
            >
              Geocode Jump
            </button>

            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
              <select
                aria-label="Category filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
              >
                <option value="all">All Categories</option>
                {allCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                aria-label="Status filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Scheduled">Scheduled</option>
                <option value="In Progress">In Progress</option>
                <option value="Assigned">Assigned</option>
                <option value="Verified for Further Action">Verified for Action</option>
                <option value="Referred to Authority">Referred to Authority</option>
                <option value="Resolved">Resolved</option>
              </select>

              <input
                type="date"
                aria-label="From date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="hidden xl:block rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-300"
              />
              <input
                type="date"
                aria-label="To date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="hidden xl:block rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-300"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Zoom / Region Reset */}
            <button
              type="button"
              onClick={() => mapRef.current?.setView([18.5204, 73.8567], 12, { animate: true })}
              className="inline-flex items-center gap-1 rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Pune
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.setView([21.1458, 79.0882], 5, { animate: true })}
              className="inline-flex items-center gap-1 rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
            >
              <Compass className="h-3.5 w-3.5" />
              India
            </button>
            <button
              type="button"
              onClick={loadMapData}
              className="inline-flex items-center gap-1 rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sync
            </button>

            {/* Real WebSocket Socket.IO telemetry indicator */}
            <div className="flex items-center gap-1.5 rounded-lg border border-[#1E2D4A] bg-[#070D1A] px-3 py-1.5 text-xs">
              {socketConnected ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-medium">Live Socket</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-amber-300 font-medium">Reconnecting</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Geocode search results dropdown */}
        {geoResults.length > 0 && (
          <div className="mx-auto max-w-[1440px] mt-2 rounded-lg border border-[#1E2D4A] bg-[#070D1A] divide-y divide-[#1E2D4A]">
            {geoResults.map((g, i) => (
              <button
                key={`${g.lat}-${g.lng}-${i}`}
                type="button"
                onClick={() => {
                  mapRef.current?.setView([g.lat, g.lng], 13, { animate: true });
                  setGeoResults([]);
                }}
                className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-[#131F38] cursor-pointer"
              >
                Jump to: {g.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Split Map + Synchronized Sidebar */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* Sidebar */}
        <aside className="lg:col-span-4 xl:col-span-3 border-b lg:border-b-0 lg:border-r border-[#1E2D4A] bg-[#0D1629] flex flex-col min-h-0 max-h-[42vh] lg:max-h-none">
          {/* Layer Controls */}
          <div className="border-b border-[#1E2D4A] p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                <Layers className="h-3.5 w-3.5 text-cyan-400" />
                Map Layers
              </span>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {combinedList.length} plotted
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 rounded-md border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layers.events}
                  onChange={(e) => setLayers((l) => ({ ...l, events: e.target.checked }))}
                  className="accent-cyan-400"
                />
                <span className="text-slate-200 truncate">Peaceful Events ({events.length})</span>
              </label>

              <label className="flex items-center gap-2 rounded-md border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layers.hotspots}
                  onChange={(e) => setLayers((l) => ({ ...l, hotspots: e.target.checked }))}
                  className="accent-amber-400"
                />
                <span className="text-slate-200 truncate">Hotspots ({hotspots.length})</span>
              </label>

              <label className="flex items-center gap-2 rounded-md border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layers.complaints}
                  onChange={(e) => setLayers((l) => ({ ...l, complaints: e.target.checked }))}
                  className="accent-blue-400"
                />
                <span className="text-slate-200 truncate">Complaints ({complaints.length})</span>
              </label>

              <label className="flex items-center gap-2 rounded-md border border-[#1E2D4A] bg-[#070D1A] px-2.5 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layers.heatmap}
                  onChange={(e) => setLayers((l) => ({ ...l, heatmap: e.target.checked }))}
                  className="accent-cyan-400"
                />
                <span className="text-slate-200 truncate">Heatmap (&ge;2)</span>
              </label>
            </div>
          </div>

          {/* Sidebar Segmented Switch */}
          <div className="border-b border-[#1E2D4A] px-4 py-2 flex gap-1 bg-[#070D1A]">
            <button
              type="button"
              onClick={() => setSidebarMode('list')}
              className={`flex-1 rounded py-1.5 text-xs font-medium cursor-pointer ${
                sidebarMode === 'list' ? 'bg-[#131F38] text-cyan-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              Activities ({combinedList.length})
            </button>
            <button
              type="button"
              onClick={() => setSidebarMode('timeline')}
              className={`flex-1 rounded py-1.5 text-xs font-medium cursor-pointer ${
                sidebarMode === 'timeline'
                  ? 'bg-[#131F38] text-cyan-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setSidebarMode('sources')}
              className={`flex-1 rounded py-1.5 text-xs font-medium cursor-pointer ${
                sidebarMode === 'sources'
                  ? 'bg-[#131F38] text-cyan-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sources
            </button>
          </div>

          {/* Sidebar Scroll Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#1E2D4A]">
            {sidebarMode === 'list' &&
              (combinedList.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-400">
                  No verified items match your current filter selection.
                </p>
              ) : (
                combinedList.map((item) => (
                  <button
                    key={`${item.kind}-${item.code}`}
                    type="button"
                    onClick={() => focusMarker(item.code, item.lat, item.lng)}
                    className={`w-full p-4 text-left hover:bg-[#131F38] transition-colors cursor-pointer ${
                      selectedCode === item.code ? 'bg-[#131F38]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="text-slate-400">{item.code}</span>
                      <span className={getStatusColorClass(item.status)}>{item.status}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-white leading-snug">
                      {item.title}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.category} · {item.location}
                    </div>
                    <div className="mt-1.5 text-[11px] text-cyan-400">{item.verification}</div>
                  </button>
                ))
              ))}

            {sidebarMode === 'timeline' &&
              timeline.map((entry) => (
                <div key={`${entry.item_type}-${entry.code}`} className="p-4 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-cyan-400">{entry.code}</span>
                    <span className="text-slate-400 tabular-nums">
                      {formatDateTime(entry.updated_at)}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-white">{entry.title}</div>
                  <div className="text-[11px] text-slate-400">
                    {entry.status} · {entry.source_attribution}
                  </div>
                </div>
              ))}

            {sidebarMode === 'sources' && (
              <div className="p-4 space-y-4 text-xs text-slate-300">
                <div className="flex items-start gap-2 rounded-lg border border-[#1E2D4A] bg-[#070D1A] p-3">
                  <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    PCM displays only moderated public events, approved civic complaints, and
                    generalized (~1.1km) corruption allegation hotspots. PCM does not claim
                    comprehensive real-world event detection or track individuals.
                  </p>
                </div>
                {sources.map((s) => (
                  <div key={s.id} className="rounded-lg border border-[#1E2D4A] bg-[#070D1A] p-3 space-y-1">
                    <div className="font-semibold text-white">{s.source_name}</div>
                    <div className="text-slate-400">{s.attribution_text}</div>
                    <div className="text-[11px] font-mono text-cyan-400">{s.license_type}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Map Canvas */}
        <div className="lg:col-span-8 xl:col-span-9 relative min-h-[400px]">
          <div ref={mapContainerRef} className="h-full w-full" />
          <div className="pointer-events-none absolute left-4 bottom-4 z-[400] hidden sm:flex items-center gap-3 rounded-lg border border-[#1E2D4A] bg-[#0D1629]/95 px-3.5 py-2 text-[11px] text-slate-300 backdrop-blur-sm">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
              Peaceful Events
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              Generalized Allegation Hotspots
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              Civic Complaints
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <Clock className="h-3 w-3" />
              Real-Time Sync Enabled
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
