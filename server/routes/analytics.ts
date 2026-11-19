import { Router } from 'express';
import { db } from '../db.ts';

export const analyticsRouter = Router();

analyticsRouter.get('/analytics', (_req, res) => {
  const totalCorruptionReports = (
    db.prepare('SELECT COUNT(*) AS c FROM corruption_reports').get() as { c: number }
  ).c;

  const totalComplaints = (
    db.prepare('SELECT COUNT(*) AS c FROM complaints').get() as { c: number }
  ).c;

  const pendingReports = (
    db
      .prepare("SELECT COUNT(*) AS c FROM corruption_reports WHERE status IN ('Submitted', 'Under Review')")
      .get() as { c: number }
  ).c;

  const verifiedReports = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM corruption_reports WHERE status IN ('Verified for Further Action', 'Referred to Authority', 'Action Recorded', 'Closed')"
      )
      .get() as { c: number }
  ).c;

  const resolvedComplaints = (
    db
      .prepare("SELECT COUNT(*) AS c FROM complaints WHERE status IN ('Resolved', 'Closed')")
      .get() as { c: number }
  ).c;

  const activeProtests = (
    db
      .prepare("SELECT COUNT(*) AS c FROM protest_events WHERE is_public = 1 AND status = 'Active'")
      .get() as { c: number }
  ).c;

  const upcomingEvents = (
    db
      .prepare("SELECT COUNT(*) AS c FROM protest_events WHERE is_public = 1 AND status = 'Scheduled'")
      .get() as { c: number }
  ).c;

  const totalVolunteers = (
    db
      .prepare("SELECT COUNT(*) AS c FROM volunteers WHERE status != 'Cancelled'")
      .get() as { c: number }
  ).c;

  const departmentDistribution = db
    .prepare(
      `SELECT
        d.name AS department,
        (SELECT COUNT(*) FROM corruption_reports cr WHERE cr.department_id = d.id) AS corruption_count,
        (SELECT COUNT(*) FROM complaints c WHERE c.department_id = d.id) AS complaint_count
       FROM departments d
       WHERE d.is_active = 1
       ORDER BY (corruption_count + complaint_count) DESC`
    )
    .all();

  const complaintCategories = db
    .prepare(
      `SELECT category, COUNT(*) AS count
       FROM complaints
       GROUP BY category
       ORDER BY count DESC`
    )
    .all();

  const corruptionCategories = db
    .prepare(
      `SELECT category, COUNT(*) AS count
       FROM corruption_reports
       GROUP BY category
       ORDER BY count DESC`
    )
    .all();

  const resolutionStats = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM complaints
       GROUP BY status
       ORDER BY count DESC`
    )
    .all();

  const reportWorkflowStats = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM corruption_reports
       GROUP BY status`
    )
    .all();

  // Monthly trend grouped from actual created_at timestamps
  const monthlyComplaints = db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count
       FROM complaints
       GROUP BY strftime('%Y-%m', created_at)
       ORDER BY month ASC`
    )
    .all() as Array<{ month: string; count: number }>;

  const monthlyReports = db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count
       FROM corruption_reports
       GROUP BY strftime('%Y-%m', created_at)
       ORDER BY month ASC`
    )
    .all() as Array<{ month: string; count: number }>;

  const monthSet = new Set<string>([
    ...monthlyComplaints.map((m) => m.month),
    ...monthlyReports.map((m) => m.month),
  ]);
  const monthlyTrends = Array.from(monthSet)
    .sort()
    .map((month) => ({
      month,
      complaints: monthlyComplaints.find((m) => m.month === month)?.count ?? 0,
      corruption_reports: monthlyReports.find((m) => m.month === month)?.count ?? 0,
    }));

  const geographicActivity = db
    .prepare(
      `SELECT city,
        SUM(CASE WHEN src = 'complaint' THEN 1 ELSE 0 END) AS complaints,
        SUM(CASE WHEN src = 'report' THEN 1 ELSE 0 END) AS reports,
        SUM(CASE WHEN src = 'event' THEN 1 ELSE 0 END) AS events
       FROM (
         SELECT city, 'complaint' AS src FROM complaints WHERE moderation_status = 'Approved Public'
         UNION ALL
         SELECT city, 'report' AS src FROM corruption_reports WHERE is_public_hotspot = 1 AND is_confidential = 0
         UNION ALL
         SELECT city, 'event' AS src FROM protest_events WHERE is_public = 1
       )
       GROUP BY city
       ORDER BY (complaints + reports + events) DESC`
    )
    .all();

  res.json({
    kpis: {
      total_corruption_reports: totalCorruptionReports,
      total_complaints: totalComplaints,
      pending_reports: pendingReports,
      verified_reports: verifiedReports,
      resolved_complaints: resolvedComplaints,
      active_protests: activeProtests,
      upcoming_events: upcomingEvents,
      total_volunteers: totalVolunteers,
    },
    department_distribution: departmentDistribution,
    complaint_categories: complaintCategories,
    corruption_categories: corruptionCategories,
    resolution_stats: resolutionStats,
    report_workflow_stats: reportWorkflowStats,
    monthly_trends: monthlyTrends,
    geographic_activity: geographicActivity,
  });
});
