import { useCallback, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { AdminModule } from './components/AdminModule';
import { AnalyticsModule } from './components/AnalyticsModule';
import { AuthModal } from './components/AuthModal';
import { ComplaintsModule } from './components/ComplaintsModule';
import { CorruptionModule } from './components/CorruptionModule';
import { LandingPage } from './components/LandingPage';
import { LiveMapPage } from './components/LiveMapPage';
import { Navbar } from './components/Navbar';
import { ProfileModule } from './components/ProfileModule';
import { ProtestsModule } from './components/ProtestsModule';
import { apiGet, apiPatch, apiPost, setCsrfToken } from './lib/api';
import type {
  ActiveTab,
  AnalyticsPayload,
  NotificationItem,
  ProtestEvent,
  User,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('landing');
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [previewEvents, setPreviewEvents] = useState<ProtestEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [socketConnected, setSocketConnected] = useState(false);
  const [lastRealtimeUpdate, setLastRealtimeUpdate] = useState<{
    type: string;
    timestamp: string;
  } | null>(null);

  const refreshAnalytics = useCallback(async () => {
    try {
      const data = await apiGet<AnalyticsPayload>('/api/analytics');
      setAnalytics(data);
    } catch {
      // ignore transient analytics error
    }
  }, []);

  const refreshPreviewEvents = useCallback(async () => {
    try {
      const data = await apiGet<{ events: ProtestEvent[] }>('/api/events');
      setPreviewEvents(data.events || []);
    } catch {
      // ignore
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const res = await apiGet<{ notifications: NotificationItem[]; unread_count: number }>(
        '/api/notifications'
      );
      setNotifications(res.notifications || []);
      setUnreadCount(res.unread_count || 0);
    } catch {
      // ignore
    }
  }, [user]);

  // Initial session + CSRF bootstrap
  useEffect(() => {
    apiGet<{ user: User | null; csrfToken: string }>('/api/auth/me').then((res) => {
      if (res.csrfToken) setCsrfToken(res.csrfToken);
      setUser(res.user);
    });
    refreshAnalytics();
    refreshPreviewEvents();
  }, [refreshAnalytics, refreshPreviewEvents]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  // Real-Time Socket.IO Client
  useEffect(() => {
    const socket: Socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1500,
    });

    socket.on('connect', () => {
      setSocketConnected(true);
      if (user?.id) {
        socket.emit('join:user', user.id);
      }
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    const handleMapPush = (type: string) => {
      setLastRealtimeUpdate({ type, timestamp: new Date().toISOString() });
      refreshPreviewEvents();
    };

    socket.on('map:event_published', () => handleMapPush('event'));
    socket.on('map:report_published', () => handleMapPush('report'));
    socket.on('map:complaint_published', () => handleMapPush('complaint'));
    socket.on('analytics:updated', () => refreshAnalytics());
    socket.on('notification:new', () => refreshNotifications());

    return () => {
      socket.disconnect();
    };
  }, [user?.id, refreshAnalytics, refreshNotifications, refreshPreviewEvents]);

  async function handleLogout() {
    await apiPost('/api/auth/logout');
    setUser(null);
    setNotifications([]);
    setUnreadCount(0);
    if (activeTab === 'admin' || activeTab === 'profile') {
      setActiveTab('landing');
    }
  }

  async function handleMarkRead(id: number) {
    await apiPatch(`/api/notifications/${id}/read`);
    await refreshNotifications();
  }

  async function handleMarkAllRead() {
    await apiPost('/api/notifications/read-all');
    await refreshNotifications();
  }

  function handleNavigate(tab: ActiveTab, code?: string) {
    setDetailCode(code || null);
    setActiveTab(tab);
  }

  return (
    <div className="min-h-screen bg-[#070D1A] text-slate-100">
      <Navbar
        activeTab={activeTab}
        onNavigate={(t) => handleNavigate(t)}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
      />

      <main>
        {activeTab === 'landing' && (
          <LandingPage
            analytics={analytics}
            previewEvents={previewEvents}
            user={user}
            onNavigate={(t) => handleNavigate(t)}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {activeTab === 'map' && (
          <LiveMapPage
            socketConnected={socketConnected}
            lastRealtimeUpdate={lastRealtimeUpdate}
            onNavigateToDetail={(tab, code) => handleNavigate(tab, code)}
          />
        )}

        {activeTab === 'corruption' && (
          <CorruptionModule user={user} initialTrackCode={detailCode} />
        )}

        {activeTab === 'complaints' && (
          <ComplaintsModule user={user} initialTrackCode={detailCode} />
        )}

        {activeTab === 'protests' && (
          <ProtestsModule
            user={user}
            onOpenAuth={() => setAuthModalOpen(true)}
            initialEventCode={detailCode}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsModule analytics={analytics} onRefresh={refreshAnalytics} />
        )}

        {activeTab === 'admin' && (
          <AdminModule
            user={user}
            onDataChanged={() => {
              refreshAnalytics();
              refreshPreviewEvents();
              refreshNotifications();
            }}
          />
        )}

        {activeTab === 'profile' && user && (
          <ProfileModule user={user} onUpdated={(u) => setUser(u)} />
        )}
      </main>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(u) => {
          setUser(u);
          refreshNotifications();
        }}
      />
    </div>
  );
}
