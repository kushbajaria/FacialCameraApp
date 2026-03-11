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
import { DEFAULT_PI_BASE_URL, getEffectivePiBaseUrl } from './config';

// ── CONFIG — change these when Pi is ready ──────────────────────────────────
export const USE_MOCK = true;                        // ← flip to false when Pi is running
export const PI_BASE_URL = DEFAULT_PI_BASE_URL;      // Legacy export for existing UI references

// ── HELPERS ─────────────────────────────────────────────────────────────────
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getApiClient(timeout = 5000) {
  const baseURL = await getEffectivePiBaseUrl();
  return axios.create({ baseURL, timeout });
}

async function apiGet<T>(path: string, timeout = 5000): Promise<T> {
  const client = await getApiClient(timeout);
  const res = await client.get(path);
  return res.data as T;
}

async function apiPost(path: string, data?: any, config?: { headers?: Record<string, string>; timeout?: number }): Promise<void> {
  const client = await getApiClient(config?.timeout ?? 5000);
  await client.post(path, data, config?.headers ? { headers: config.headers } : undefined);
}

async function apiDelete(path: string, timeout = 5000): Promise<void> {
  const client = await getApiClient(timeout);
  await client.delete(path);
}

// ── DOOR ─────────────────────────────────────────────────────────────────────
export async function getDoorStatus(): Promise<{ locked: boolean }> {
  if (USE_MOCK) { await delay(300); return { ...MOCK_DOOR_STATUS }; }
  return apiGet<{ locked: boolean }>('/door/status');
}

export async function lockDoor(): Promise<void> {
  if (USE_MOCK) { await delay(500); return; }
  await apiPost('/door/lock');
}

export async function unlockDoor(): Promise<void> {
  if (USE_MOCK) { await delay(500); return; }
  await apiPost('/door/unlock');
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
  return apiGet<Member[]>('/members');
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
  const client = await getApiClient();
  const res = await client.post(`/members/add?name=${encodeURIComponent(name)}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data as Member;
}

export async function removeMember(id: string): Promise<void> {
  if (USE_MOCK) { await delay(400); return; }
  await apiDelete(`/members/${id}`);
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
  return apiGet<LogEntry[]>(`/logs?limit=${limit}`);
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
  return apiGet<Alert[]>('/alerts');
}

export async function markAlertRead(id: number): Promise<void> {
  if (USE_MOCK) { await delay(200); return; }
  await apiPost(`/alerts/${id}/read`);
}

// ── HEALTH CHECK ─────────────────────────────────────────────────────────────
export async function pingPi(): Promise<boolean> {
  if (USE_MOCK) return false;
  try {
    await apiGet('/health', 2000);
    return true;
  } catch {
    return false;
  }
}
