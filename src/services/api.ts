// ─────────────────────────────────────────────────────────────────────────────
// API SERVICE
// Toggle USE_MOCK to switch between mock data and your real Pi backend.
// When your Pi is running, set USE_MOCK = false and update PI_BASE_URL.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import {
  MOCK_MEMBERS,
  MOCK_LOGS,
  MOCK_ALERTS,
  MOCK_DOOR_STATUS,
} from '../mock/data';

// ── CONFIG — change these when Pi is ready ──────────────────────────────────
export const USE_MOCK = true;                        // ← flip to false when Pi is running
export const PI_BASE_URL = 'http://192.168.1.100:8000'; // ← your Pi's local IP

const api = axios.create({ baseURL: PI_BASE_URL, timeout: 5000 });

// ── HELPERS ─────────────────────────────────────────────────────────────────
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── DOOR ─────────────────────────────────────────────────────────────────────
export async function getDoorStatus(): Promise<{ locked: boolean }> {
  if (USE_MOCK) { await delay(300); return { ...MOCK_DOOR_STATUS }; }
  const res = await api.get('/door/status');
  return res.data;
}

export async function lockDoor(): Promise<void> {
  if (USE_MOCK) { await delay(500); return; }
  await api.post('/door/lock');
}

export async function unlockDoor(): Promise<void> {
  if (USE_MOCK) { await delay(500); return; }
  await api.post('/door/unlock');
}

// ── MEMBERS ──────────────────────────────────────────────────────────────────
export interface Member {
  id: string;
  name: string;
  role: string;
  addedDate: string;
}

export async function getMembers(): Promise<Member[]> {
  if (USE_MOCK) { await delay(300); return [...MOCK_MEMBERS]; }
  const res = await api.get('/members');
  return res.data;
}

export async function addMember(name: string, role: string, photo?: any): Promise<Member> {
  if (USE_MOCK) {
    await delay(600);
    return { id: Date.now().toString(), name, role, addedDate: new Date().toISOString() };
  }
  const form = new FormData();
  form.append('name', name);
  form.append('role', role);
  if (photo) form.append('photo', photo);
  const res = await api.post(`/members/add?name=${encodeURIComponent(name)}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function removeMember(id: string): Promise<void> {
  if (USE_MOCK) { await delay(400); return; }
  await api.delete(`/members/${id}`);
}

// ── LOGS ─────────────────────────────────────────────────────────────────────
export interface LogEntry {
  id: number;
  type: 'authorized' | 'unknown' | 'motion' | 'manual_lock';
  name: string;
  timestamp: string;
  confidence: number | null;
  snapshot: string | null;
}

export async function getLogs(limit = 50): Promise<LogEntry[]> {
  if (USE_MOCK) { await delay(300); return [...MOCK_LOGS] as LogEntry[]; }
  const res = await api.get(`/logs?limit=${limit}`);
  return res.data;
}

// ── ALERTS ───────────────────────────────────────────────────────────────────
export interface Alert {
  id: number;
  timestamp: string;
  label: string;
  read: boolean;
}

export async function getAlerts(): Promise<Alert[]> {
  if (USE_MOCK) { await delay(300); return [...MOCK_ALERTS] as Alert[]; }
  const res = await api.get('/alerts');
  return res.data;
}

export async function markAlertRead(id: number): Promise<void> {
  if (USE_MOCK) { await delay(200); return; }
  await api.post(`/alerts/${id}/read`);
}

// ── HEALTH CHECK ─────────────────────────────────────────────────────────────
export async function pingPi(): Promise<boolean> {
  if (USE_MOCK) return false;
  try {
    await api.get('/health', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
