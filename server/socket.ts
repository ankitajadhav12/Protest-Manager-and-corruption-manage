import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifySessionToken } from './security.ts';

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    // Parse cookie if present so authenticated users join personal notification rooms
    const rawCookie = socket.handshake.headers.cookie || '';
    const sessionMatch = rawCookie.match(/pcm_session=([^;]+)/);
    if (sessionMatch?.[1]) {
      const verified = verifySessionToken(decodeURIComponent(sessionMatch[1]));
      if (verified?.uid) {
        socket.join(`user:${verified.uid}`);
      }
    }

    socket.on('join:user', (userId: number) => {
      if (Number.isInteger(userId) && userId > 0) {
        socket.join(`user:${userId}`);
      }
    });

    socket.emit('connection:ready', {
      connected: true,
      timestamp: new Date().toISOString(),
    });
  });

  return io;
}

export function emitMapUpdate(eventName: string, payload: unknown): void {
  if (!io) return;
  io.emit(eventName, payload);
  io.emit('analytics:updated', { timestamp: new Date().toISOString() });
}

export function emitToUser(userId: number, eventName: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(eventName, payload);
}
