import { Router } from 'express';
import { db } from '../db.ts';
import { createRateLimiter, generalizeCoordinate } from '../security.ts';

export const mapRouter = Router();

const geocodeLimiter = createRateLimiter(30, 60 * 1000);
const geocodeCache = new Map<string, { timestamp: number; results: unknown[] }>();
let lastNominatimCall = 0;

function applyCommonFilters(
  clauses: string[],
  params: unknown[],
  req: { query: Record<string, unknown> },
  columns: {
    searchCols: string[];
    categoryCol: string;
    statusCol: string;
    dateCol: string;
  }
) {
  const q = req.query.q ? String(req.query.q).trim() : '';
  const category = req.query.category ? String(req.query.category).trim() : '';
  const status = req.query.status ? String(req.query.status).trim() : '';
  const from = req.query.from ? String(req.query.from).trim() : '';
  const to = req.query.to ? String(req.query.to).trim() : '';

  if (q) {
    const like = `%${q}%`;
    clauses.push(`(${columns.searchCols.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    for (let i = 0; i < columns.searchCols.length; i++) params.push(like);
  }
  if (category && category !== 'all') {
    clauses.push(`${columns.categoryCol} = ?`);
    params.push(category);
  }
  if (status && status !== 'all') {
    clauses.push(`${columns.statusCol} = ?`);
    params.push(status);
  }
  if (from) {
    clauses.push(`date(${columns.dateCol}) >= date(?)`);
    params.push(from);
  }
  if (to) {
    clauses.push(`date(${columns.dateCol}) <= date(?)`);
    params.push(to);
  }
}

mapRouter.get('/map/events', (req, res) => {
  const clauses = ['pe.is_public = 1'];
  const params: unknown[] = [];
  applyCommonFilters(clauses, params, req, {
    searchCols: ['pe.title', 'pe.public_location', 'pe.city', 'pe.description'],
    categoryCol: 'pe.category',
    statusCol: 'pe.status',
    dateCol: 'pe.start_time',
  });

  const rows = db
    .prepare(
      `SELECT
        pe.id, pe.event_code AS code, pe.title, pe.category, pe.description,
        pe.public_location AS location, pe.city, pe.state, pe.latitude, pe.longitude,
        pe.start_time AS event_date, pe.end_time, pe.status, pe.verification_label,
        pe.source_attribution, pe.updated_at,
        (SELECT COUNT(*) FROM volunteers v WHERE v.event_id = pe.id AND v.status != 'Cancelled') AS volunteer_count
       FROM protest_events pe
       WHERE ${clauses.join(' AND ')}
       ORDER BY pe.start_time ASC`
    )
    .all(...params);

  res.json({ events: rows });
});

mapRouter.get('/map/complaints', (req, res) => {
  const clauses = ["c.moderation_status = 'Approved Public'"];
  const params: unknown[] = [];
  applyCommonFilters(clauses, params, req, {
    searchCols: ['c.title', 'c.location_text', 'c.city', 'c.description'],
    categoryCol: 'c.category',
    statusCol: 'c.status',
    dateCol: 'c.created_at',
  });

  const rows = db
    .prepare(
      `SELECT
        c.id, c.complaint_code AS code, c.title, c.category, c.description,
        c.location_text AS location, c.city, c.state, c.latitude, c.longitude,
        c.created_at AS reported_date, c.status, c.verification_label,
        c.source_attribution, c.updated_at, d.name AS department_name
       FROM complaints c
       LEFT JOIN departments d ON d.id = c.department_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY c.updated_at DESC`
    )
    .all(...params);

  res.json({ complaints: rows });
});

mapRouter.get('/map/hotspots', (req, res) => {
  // Ethical rule: ONLY moderated public hotspots, generalized coords, NEVER confidential or reporter identity
  const clauses = [
    'cr.is_public_hotspot = 1',
    'cr.is_confidential = 0',
    'cr.latitude IS NOT NULL',
    'cr.longitude IS NOT NULL',
  ];
  const params: unknown[] = [];
  applyCommonFilters(clauses, params, req, {
    searchCols: ['cr.title', 'cr.general_location', 'cr.city', 'cr.description'],
    categoryCol: 'cr.category',
    statusCol: 'cr.status',
    dateCol: 'cr.created_at',
  });

  const rows = db
    .prepare(
      `SELECT
        cr.id, cr.tracking_id AS code, cr.title, cr.category, cr.description,
        cr.general_location AS location, cr.city, cr.state,
        cr.latitude, cr.longitude,
        cr.created_at AS reported_date, cr.status, cr.verification_label,
        cr.source_attribution, cr.updated_at, d.name AS department_name
       FROM corruption_reports cr
       JOIN departments d ON d.id = cr.department_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY cr.updated_at DESC`
    )
    .all(...params) as Array<{ latitude: number; longitude: number; [key: string]: unknown }>;

  const generalized = rows.map((r) => ({
    ...r,
    latitude: generalizeCoordinate(r.latitude),
    longitude: generalizeCoordinate(r.longitude),
    ethical_disclaimer: 'Generalized hotspot (~1.1km grid). Represents an allegation under verification, not proof.',
  }));

  res.json({ hotspots: generalized });
});

mapRouter.get('/map/heatmap', (_req, res) => {
  // Ethical safeguard: aggregate into ~2.2km grid buckets and enforce minimum-count threshold >= 2
  const buckets = new Map<string, { lat: number; lng: number; count: number; city: string }>();

  const addPoint = (lat: number | null, lng: number | null, city: string) => {
    if (lat === null || lng === null) return;
    // Bucket to 0.02 deg (~2.2km)
    const bLat = Number((Math.round(lat / 0.02) * 0.02).toFixed(3));
    const bLng = Number((Math.round(lng / 0.02) * 0.02).toFixed(3));
    const key = `${bLat}:${bLng}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(key, { lat: bLat, lng: bLng, count: 1, city });
    }
  };

  const events = db
    .prepare('SELECT latitude, longitude, city FROM protest_events WHERE is_public = 1')
    .all() as Array<{ latitude: number; longitude: number; city: string }>;
  for (const e of events) addPoint(e.latitude, e.longitude, e.city);

  const complaints = db
    .prepare("SELECT latitude, longitude, city FROM complaints WHERE moderation_status = 'Approved Public'")
    .all() as Array<{ latitude: number; longitude: number; city: string }>;
  for (const c of complaints) addPoint(c.latitude, c.longitude, c.city);

  const reports = db
    .prepare(
      'SELECT latitude, longitude, city FROM corruption_reports WHERE is_public_hotspot = 1 AND is_confidential = 0'
    )
    .all() as Array<{ latitude: number | null; longitude: number | null; city: string }>;
  for (const r of reports) addPoint(r.latitude, r.longitude, r.city);

  // Enforce minimum threshold count >= 2 for privacy-preserving heatmap
  const cells = Array.from(buckets.values()).filter((b) => b.count >= 2);
  res.json({
    threshold: 2,
    cells,
  });
});

mapRouter.get('/map/timeline', (_req, res) => {
  const events = db
    .prepare(
      `SELECT 'event' AS item_type, id, event_code AS code, title, category, public_location AS location,
              status, verification_label, source_attribution, updated_at
       FROM protest_events WHERE is_public = 1`
    )
    .all();

  const complaints = db
    .prepare(
      `SELECT 'complaint' AS item_type, id, complaint_code AS code, title, category, location_text AS location,
              status, verification_label, source_attribution, updated_at
       FROM complaints WHERE moderation_status = 'Approved Public'`
    )
    .all();

  const hotspots = db
    .prepare(
      `SELECT 'hotspot' AS item_type, id, tracking_id AS code, title, category, general_location AS location,
              status, verification_label, source_attribution, updated_at
       FROM corruption_reports WHERE is_public_hotspot = 1 AND is_confidential = 0`
    )
    .all();

  const combined = [...events, ...complaints, ...hotspots]
    .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 20);

  res.json({ timeline: combined });
});

mapRouter.get('/map/sources', (_req, res) => {
  const sources = db
    .prepare('SELECT id, source_name, source_url, license_type, attribution_text FROM external_event_sources WHERE is_active = 1')
    .all();
  res.json({ sources });
});

// Nominatim proxy respecting OSM usage policies (User-Agent + 1 req/sec throttle + cache)
mapRouter.get('/geocode', geocodeLimiter, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) {
    res.status(400).json({ error: 'Search query must be at least 3 characters.' });
    return;
  }

  const cacheKey = q.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 30) {
    res.json({ results: cached.results, cached: true });
    return;
  }

  try {
    const now = Date.now();
    const waitMs = Math.max(0, 1100 - (now - lastNominatimCall));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastNominatimCall = Date.now();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'in');
    url.searchParams.set('limit', '5');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'PCM-CivicTechPlatform/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
      address?: { city?: string; town?: string; state_district?: string; state?: string };
    }>;

    const results = data.map((item) => ({
      display_name: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
      city: item.address?.city || item.address?.town || item.address?.state_district || 'Pune',
      state: item.address?.state || 'Maharashtra',
    }));

    geocodeCache.set(cacheKey, { timestamp: Date.now(), results });
    res.json({ results, cached: false });
  } catch {
    // Graceful India/Pune fallback lookup if external network is unavailable
    const fallbackLocations = [
      { display_name: 'Shivajinagar, Pune, Maharashtra, India', lat: 18.5308, lng: 73.8475, city: 'Pune', state: 'Maharashtra' },
      { display_name: 'Kothrud, Pune, Maharashtra, India', lat: 18.5074, lng: 73.8077, city: 'Pune', state: 'Maharashtra' },
      { display_name: 'Hadapsar, Pune, Maharashtra, India', lat: 18.5089, lng: 73.9259, city: 'Pune', state: 'Maharashtra' },
      { display_name: 'Baner, Pune, Maharashtra, India', lat: 18.559, lng: 73.7868, city: 'Pune', state: 'Maharashtra' },
      { display_name: 'Viman Nagar, Pune, Maharashtra, India', lat: 18.5679, lng: 73.9143, city: 'Pune', state: 'Maharashtra' },
      { display_name: 'Deccan Gymkhana, Pune, Maharashtra, India', lat: 18.5158, lng: 73.8414, city: 'Pune', state: 'Maharashtra' },
      { display_name: 'Mumbai Central, Maharashtra, India', lat: 19.0176, lng: 72.8562, city: 'Mumbai', state: 'Maharashtra' },
      { display_name: 'Indiranagar, Bengaluru, Karnataka, India', lat: 12.9784, lng: 77.6408, city: 'Bengaluru', state: 'Karnataka' },
      { display_name: 'Connaught Place, New Delhi, India', lat: 28.6315, lng: 77.2167, city: 'New Delhi', state: 'Delhi' },
    ];
    const filtered = fallbackLocations.filter((l) =>
      l.display_name.toLowerCase().includes(q.toLowerCase())
    );
    res.json({
      results: filtered.length > 0 ? filtered : fallbackLocations.slice(0, 3),
      fallback: true,
    });
  }
});
