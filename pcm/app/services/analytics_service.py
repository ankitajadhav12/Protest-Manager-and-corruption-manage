import numpy as np
import pandas as pd
from app.models.db import fetch_all


def compute_analytics_payload() -> dict:
    """Compute civic analytics directly from MySQL 8.0 records using Pandas & NumPy."""
    reports = fetch_all(
        """
        SELECT cr.id, cr.category, cr.status, cr.city, cr.created_at,
               d.name AS department_name
        FROM corruption_reports cr
        JOIN departments d ON d.id = cr.department_id
        """
    )
    complaints = fetch_all(
        """
        SELECT c.id, c.category, c.status, c.city, c.created_at,
               COALESCE(d.name, 'Unassigned') AS department_name
        FROM complaints c
        LEFT JOIN departments d ON d.id = c.department_id
        """
    )
    events = fetch_all(
        "SELECT id, category, status, city, is_public, start_time FROM protest_events"
    )
    volunteers = fetch_all("SELECT id, status FROM volunteers WHERE status != 'Cancelled'")

    df_reports = pd.DataFrame(reports)
    df_complaints = pd.DataFrame(complaints)
    df_events = pd.DataFrame(events)

    pending_statuses = {"Submitted", "Under Review"}
    verified_statuses = {
        "Verified for Further Action",
        "Referred to Authority",
        "Action Recorded",
        "Closed",
    }

    pending_reports = (
        int(np.sum(df_reports["status"].isin(pending_statuses)))
        if not df_reports.empty
        else 0
    )
    verified_reports = (
        int(np.sum(df_reports["status"].isin(verified_statuses)))
        if not df_reports.empty
        else 0
    )
    resolved_complaints = (
        int(np.sum(df_complaints["status"].isin({"Resolved", "Closed"})))
        if not df_complaints.empty
        else 0
    )
    active_protests = (
        int(np.sum((df_events["is_public"] == 1) & (df_events["status"] == "Active")))
        if not df_events.empty
        else 0
    )
    upcoming_events = (
        int(np.sum((df_events["is_public"] == 1) & (df_events["status"] == "Scheduled")))
        if not df_events.empty
        else 0
    )

    # Monthly trend via Pandas datetime resampling
    monthly_trends = []
    if not df_complaints.empty or not df_reports.empty:
        c_months = (
            pd.to_datetime(df_complaints["created_at"]).dt.to_period("M").astype(str).value_counts()
            if not df_complaints.empty
            else pd.Series(dtype=int)
        )
        r_months = (
            pd.to_datetime(df_reports["created_at"]).dt.to_period("M").astype(str).value_counts()
            if not df_reports.empty
            else pd.Series(dtype=int)
        )
        all_months = sorted(set(c_months.index).union(set(r_months.index)))
        for m in all_months:
            monthly_trends.append(
                {
                    "month": m,
                    "complaints": int(c_months.get(m, 0)),
                    "corruption_reports": int(r_months.get(m, 0)),
                }
            )

    dept_dist = []
    if not df_reports.empty or not df_complaints.empty:
        r_dept = df_reports["department_name"].value_counts() if not df_reports.empty else pd.Series(dtype=int)
        c_dept = df_complaints["department_name"].value_counts() if not df_complaints.empty else pd.Series(dtype=int)
        for dept in sorted(set(r_dept.index).union(set(c_dept.index))):
            dept_dist.append(
                {
                    "department": dept,
                    "corruption_count": int(r_dept.get(dept, 0)),
                    "complaint_count": int(c_dept.get(dept, 0)),
                }
            )

    complaint_cats = (
        [{"category": k, "count": int(v)} for k, v in df_complaints["category"].value_counts().items()]
        if not df_complaints.empty
        else []
    )
    resolution_stats = (
        [{"status": k, "count": int(v)} for k, v in df_complaints["status"].value_counts().items()]
        if not df_complaints.empty
        else []
    )

    return {
        "kpis": {
            "total_corruption_reports": int(len(df_reports)),
            "total_complaints": int(len(df_complaints)),
            "pending_reports": pending_reports,
            "verified_reports": verified_reports,
            "resolved_complaints": resolved_complaints,
            "active_protests": active_protests,
            "upcoming_events": upcoming_events,
            "total_volunteers": int(len(volunteers)),
        },
        "department_distribution": dept_dist,
        "complaint_categories": complaint_cats,
        "resolution_stats": resolution_stats,
        "monthly_trends": monthly_trends,
    }
