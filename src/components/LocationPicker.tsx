import L from 'leaflet';
import { MapPin, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../lib/api';
import type { GeocodeResult } from '../types';

interface LocationPickerProps {
  latitude: number;
  longitude: number;
  locationLabel: string;
  onSelectLocation: (loc: { lat: number; lng: number; address: string; city: string; state: string }) => void;
  generalizeNote?: string;
}

export function LocationPicker({
  latitude,
  longitude,
  locationLabel,
  onSelectLocation,
  generalizeNote,
}: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  const [query, setQuery] = useState(locationLabel);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [latitude, longitude],
      zoom: 13,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.circleMarker([latitude, longitude], {
      radius: 8,
      color: '#22d3ee',
      fillColor: '#06b6d4',
      fillOpacity: 0.85,
      weight: 2,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      onSelectLocation({
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
        address: query || `Selected Area (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
        city: 'Pune',
        state: 'Maharashtra',
      });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
      mapRef.current.setView([latitude, longitude], mapRef.current.getZoom());
    }
  }, [latitude, longitude]);

  async function handleSearch() {
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const data = await apiGet<{ results: GeocodeResult[] }>(
        `/api/geocode?q=${encodeURIComponent(query.trim())}`
      );
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Search locality in Pune or India (e.g., Kothrud, Shivajinagar)"
            className="w-full rounded-lg border border-[#1E2D4A] bg-[#070D1A] pl-9 pr-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
          />
          <MapPin className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E2D4A] bg-[#131F38] px-3.5 py-2 text-xs font-medium text-cyan-300 hover:bg-[#1a2948] cursor-pointer whitespace-nowrap"
        >
          <Search className="h-3.5 w-3.5" />
          {searching ? 'Locating...' : 'Lookup'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="max-h-36 overflow-y-auto rounded-lg border border-[#1E2D4A] bg-[#070D1A] divide-y divide-[#1E2D4A]">
          {results.map((r, idx) => (
            <button
              key={`${r.lat}-${r.lng}-${idx}`}
              type="button"
              onClick={() => {
                setQuery(r.display_name);
                setResults([]);
                onSelectLocation({
                  lat: r.lat,
                  lng: r.lng,
                  address: r.display_name,
                  city: r.city,
                  state: r.state,
                });
              }}
              className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-[#131F38] cursor-pointer"
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}

      <div
        ref={mapContainerRef}
        className="h-44 w-full rounded-lg border border-[#1E2D4A] overflow-hidden"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>Click the map or search via OpenStreetMap Nominatim to set coordinates.</span>
        <span className="font-mono tabular-nums text-cyan-400">
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </span>
      </div>
      {generalizeNote && <p className="text-[11px] text-slate-400">{generalizeNote}</p>}
    </div>
  );
}
