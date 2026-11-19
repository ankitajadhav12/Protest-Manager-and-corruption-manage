import Chart from 'chart.js/auto';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AnalyticsPayload } from '../types';

interface AnalyticsModuleProps {
  analytics: AnalyticsPayload | null;
  onRefresh: () => void;
}

export function AnalyticsModule({ analytics, onRefresh }: AnalyticsModuleProps) {
  const trendsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const deptCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const categoryCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resolutionCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!analytics) return;
    const charts: Chart[] = [];

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#1E2D4A';

    if (trendsCanvasRef.current) {
      charts.push(
        new Chart(trendsCanvasRef.current, {
          type: 'line',
          data: {
            labels: analytics.monthly_trends.map((m) => m.month),
            datasets: [
              {
                label: 'Civic Complaints',
                data: analytics.monthly_trends.map((m) => m.complaints),
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.15)',
                fill: true,
                tension: 0.3,
              },
              {
                label: 'Corruption Allegations',
                data: analytics.monthly_trends.map((m) => m.corruption_reports),
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                fill: true,
                tension: 0.3,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
          },
        })
      );
    }

    if (deptCanvasRef.current) {
      charts.push(
        new Chart(deptCanvasRef.current, {
          type: 'bar',
          data: {
            labels: analytics.department_distribution.map((d) =>
              d.department.length > 24 ? d.department.slice(0, 22) + '...' : d.department
            ),
            datasets: [
              {
                label: 'Corruption Reports',
                data: analytics.department_distribution.map((d) => d.corruption_count),
                backgroundColor: '#f59e0b',
              },
              {
                label: 'Civic Complaints',
                data: analytics.department_distribution.map((d) => d.complaint_count),
                backgroundColor: '#3b82f6',
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
          },
        })
      );
    }

    if (categoryCanvasRef.current) {
      charts.push(
        new Chart(categoryCanvasRef.current, {
          type: 'doughnut',
          data: {
            labels: analytics.complaint_categories.map((c) => c.category),
            datasets: [
              {
                data: analytics.complaint_categories.map((c) => c.count),
                backgroundColor: ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899'],
                borderColor: '#0D1629',
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } },
          },
        })
      );
    }

    if (resolutionCanvasRef.current) {
      charts.push(
        new Chart(resolutionCanvasRef.current, {
          type: 'bar',
          data: {
            labels: analytics.resolution_stats.map((r) => r.status),
            datasets: [
              {
                label: 'Complaints by Status',
                data: analytics.resolution_stats.map((r) => r.count),
                backgroundColor: '#06b6d4',
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
          },
        })
      );
    }

    return () => {
      charts.forEach((c) => c.destroy());
    };
  }, [analytics]);

  if (!analytics) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-12 text-center text-sm text-slate-400">
        Loading live database analytics...
      </div>
    );
  }

  const k = analytics.kpis;

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#1E2D4A] pb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Analytics & Public Accountability Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            All figures and trends are computed directly from live database records.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-[#1E2D4A] bg-[#0D1629] px-4 py-2 text-xs font-medium text-cyan-300 hover:border-cyan-500/40 cursor-pointer self-start"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Metrics
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total Corruption Reports', val: k.total_corruption_reports, color: 'text-white' },
          { label: 'Pending Reports', val: k.pending_reports, color: 'text-amber-400' },
          { label: 'Verified Reports', val: k.verified_reports, color: 'text-cyan-400' },
          { label: 'Total Civic Complaints', val: k.total_complaints, color: 'text-white' },
          { label: 'Resolved Complaints', val: k.resolved_complaints, color: 'text-emerald-400' },
          { label: 'Active Protests', val: k.active_protests, color: 'text-cyan-400' },
          { label: 'Upcoming Events', val: k.upcoming_events, color: 'text-blue-400' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-4">
            <div className="text-[11px] text-slate-400 leading-snug">{item.label}</div>
            <div className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${item.color}`}>
              {item.val}
            </div>
          </div>
        ))}
      </div>

      {/* Chart.js Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5">
          <h2 className="font-display text-sm font-semibold text-white mb-4">
            Monthly Complaint & Report Trends
          </h2>
          <div className="h-64">
            <canvas ref={trendsCanvasRef} />
          </div>
        </div>

        <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5">
          <h2 className="font-display text-sm font-semibold text-white mb-4">
            Department-Wise Report & Complaint Distribution
          </h2>
          <div className="h-64">
            <canvas ref={deptCanvasRef} />
          </div>
        </div>

        <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5">
          <h2 className="font-display text-sm font-semibold text-white mb-4">
            Civic Issue Categories
          </h2>
          <div className="h-64">
            <canvas ref={categoryCanvasRef} />
          </div>
        </div>

        <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] p-5">
          <h2 className="font-display text-sm font-semibold text-white mb-4">
            Complaint Resolution Statistics
          </h2>
          <div className="h-64">
            <canvas ref={resolutionCanvasRef} />
          </div>
        </div>
      </div>

      {/* Aggregated Geographic Activity Table */}
      <div className="rounded-xl border border-[#1E2D4A] bg-[#0D1629] overflow-hidden">
        <div className="border-b border-[#1E2D4A] px-5 py-4">
          <h2 className="font-display text-sm font-semibold text-white">
            Aggregated Geographic Civic Activity (Public Verified Records)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#070D1A] text-slate-400 border-b border-[#1E2D4A]">
              <tr>
                <th className="px-5 py-3 font-medium">City / Region</th>
                <th className="px-5 py-3 font-medium text-right">Civic Complaints</th>
                <th className="px-5 py-3 font-medium text-right">Public Allegation Hotspots</th>
                <th className="px-5 py-3 font-medium text-right">Peaceful Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D4A]">
              {analytics.geographic_activity.map((g) => (
                <tr key={g.city}>
                  <td className="px-5 py-3 font-medium text-white">{g.city}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-300">
                    {g.complaints}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-amber-400">
                    {g.reports}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-cyan-400">
                    {g.events}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
