import { db } from '../db.ts';

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DuplicateCandidate {
  reference_code: string;
  title: string;
  category: string;
  location: string;
  status: string;
  similarity_score: number;
}

export function findPotentialDuplicateReports(params: {
  title: string;
  description: string;
  category: string;
  departmentId: number;
  generalLocation: string;
}): DuplicateCandidate[] {
  const rows = db
    .prepare(
      `SELECT tracking_id, title, description, category, general_location, status, department_id
       FROM corruption_reports
       ORDER BY id DESC
       LIMIT 100`
    )
    .all() as Array<{
    tracking_id: string;
    title: string;
    description: string;
    category: string;
    general_location: string;
    status: string;
    department_id: number;
  }>;

  const inputTokens = tokenize(`${params.title} ${params.description} ${params.generalLocation}`);
  const matches: DuplicateCandidate[] = [];

  for (const row of rows) {
    const rowTokens = tokenize(`${row.title} ${row.description} ${row.general_location}`);
    let score = jaccardSimilarity(inputTokens, rowTokens);
    if (row.category === params.category) score += 0.15;
    if (row.department_id === params.departmentId) score += 0.1;

    if (score >= 0.42) {
      matches.push({
        reference_code: row.tracking_id,
        title: row.title,
        category: row.category,
        location: row.general_location,
        status: row.status,
        similarity_score: Number(Math.min(score, 0.99).toFixed(2)),
      });
    }
  }

  return matches.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, 3);
}

export function findPotentialDuplicateComplaints(params: {
  title: string;
  description: string;
  category: string;
  locationText: string;
}): DuplicateCandidate[] {
  const rows = db
    .prepare(
      `SELECT complaint_code, title, description, category, location_text, status
       FROM complaints
       ORDER BY id DESC
       LIMIT 100`
    )
    .all() as Array<{
    complaint_code: string;
    title: string;
    description: string;
    category: string;
    location_text: string;
    status: string;
  }>;

  const inputTokens = tokenize(`${params.title} ${params.description} ${params.locationText}`);
  const matches: DuplicateCandidate[] = [];

  for (const row of rows) {
    const rowTokens = tokenize(`${row.title} ${row.description} ${row.location_text}`);
    let score = jaccardSimilarity(inputTokens, rowTokens);
    if (row.category === params.category) score += 0.15;

    if (score >= 0.42) {
      matches.push({
        reference_code: row.complaint_code,
        title: row.title,
        category: row.category,
        location: row.location_text,
        status: row.status,
        similarity_score: Number(Math.min(score, 0.99).toFixed(2)),
      });
    }
  }

  return matches.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, 3);
}
