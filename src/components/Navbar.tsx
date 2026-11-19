import { Bell, CheckCheck, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime } from '../lib/api';
import type { ActiveTab, NotificationItem, User } from '../types';

interface NavbarProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  user: User | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
}

export function Navbar({
  activeTab,
  onNavigate,
  user,
  onOpenAuth,
  onLogout,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}: NavbarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'map', label: 'Live Map' },
    { id: 'corruption', label: 'Corruption' },
    { id: 'complaints', label: 'Complaints' },
    { id: 'protests', label: 'Protests' },
    { id: 'analytics', label: 'Analytics' },
  ];

  if (user?.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Admin' });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#1E2D4A] bg-[#070D1A]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            onNavigate('landing');
            setMobileOpen(false);
          }}
          className="font-display text-lg font-bold tracking-tight text-white hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          PCM
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Primary Navigation">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'text-cyan-400' : 'text-slate-300 hover:text-white'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-0 -bottom-[1px] h-[2px] bg-cyan-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action or account trigger */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="relative flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#1E2D4A] bg-[#0D1629] text-slate-300 hover:border-cyan-500/40 hover:text-white transition-colors cursor-pointer"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded bg-cyan-500 px-1 font-mono text-[10px] font-bold text-slate-950 tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="hidden sm:flex items-center gap-2 rounded-lg border border-[#1E2D4A] bg-[#0D1629] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="max-w-[120px] truncate">{user.full_name}</span>
                <span className="text-slate-500">/</span>
                <span className="capitalize text-cyan-400">{user.role}</span>
              </button>

              <button
                type="button"
                onClick={onLogout}
                className="hidden sm:inline-flex rounded-lg border border-[#1E2D4A] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-[#131F38] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign Out
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-lg border border-[#1E2D4A] bg-[#0D1629] shadow-2xl">
                  <div className="flex items-center justify-between border-b border-[#1E2D4A] px-4 py-3">
                    <span className="text-sm font-semibold text-white">Notifications</span>
                    <button
                      type="button"
                      onClick={onMarkAllRead}
                      className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#1E2D4A]">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-slate-400">
                        No notifications yet.
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            onMarkRead(n.id);
                            if (n.link_path) {
                              onNavigate(n.link_path as ActiveTab);
                              setNotifOpen(false);
                            }
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-[#131F38] transition-colors cursor-pointer ${
                            n.is_read === 0 ? 'bg-cyan-500/5' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white">{n.title}</span>
                            {n.is_read === 0 && (
                              <span className="text-[10px] font-mono text-cyan-400 shrink-0">NEW</span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-400 leading-relaxed">{n.message}</p>
                          <span className="mt-1.5 block font-mono text-[11px] text-slate-500 tabular-nums">
                            {formatDateTime(n.created_at)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Toggle Menu"
            className="flex md:hidden h-9 w-9 items-center justify-center rounded-lg border border-[#1E2D4A] bg-[#0D1629] text-slate-200"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#1E2D4A] bg-[#070D1A] px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  setMobileOpen(false);
                }}
                className={`rounded-md px-3 py-2 text-left text-sm font-medium ${
                  activeTab === item.id
                    ? 'bg-[#131F38] text-cyan-400'
                    : 'text-slate-300 hover:bg-[#0D1629]'
                }`}
              >
                {item.label}
              </button>
            ))}
            {user && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('profile');
                    setMobileOpen(false);
                  }}
                  className="rounded-md px-3 py-2 text-left text-sm text-slate-300 hover:bg-[#0D1629]"
                >
                  Account Profile ({user.role})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    setMobileOpen(false);
                  }}
                  className="rounded-md px-3 py-2 text-left text-sm text-rose-400 hover:bg-[#0D1629]"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
