/**
 * API service — all communication with the Pi backend and the MacBook
 * enrollment server goes through these functions.
 *
 * Set USE_MOCK = true to run the app with fake data (no Pi needed).
 */

import axios from 'axios';
import {
  MOCK_MEMBERS,
  MOCK_LOGS,
  MOCK_ALERTS,
  MOCK_DOOR_STATUS,
} from '../mock/data';
import { DEFAULT_MACBOOK_BASE_URL, getEffectivePiBaseUrl } from './config';

export const USE_MOCK = false;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Build an axios instance pointed at the Pi, using the saved IP/port. */
async function getApiClient(timeout = 5000) {
  const baseURL = await getEffectivePiBaseUrl();
  return axios.create({ baseURL, timeout });
}

async function apiGet<T>(path: string, timeout = 5000): Promise<T> {
  const client = await getApiClient(timeout);
  return (await client.get(path)).data as T;
}

async function apiPost<T = void>(path: string, data?: any, timeout = 5000): Promise<T> {
  const client = await getApiClient(timeout);
  return (await client.post(path, data)).data as T;
}

async function apiDelete(path: string, timeout = 5000): Promise<void> {
  const client = await getApiClient(timeout);
  await client.delete(path);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Member {
  id: string;
  name: string;
  role: string;
  addedDate: string;
  faceEnrolled: boolean;
  faceProfileVersion: number;
  lastEnrolledAt: string | null;
  livenessScore: number | null;
}

export interface FaceEnrollmentSession {
  sessionId: string;
  memberId: string;
  status: 'capturing' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  qualityScore: number;
  livenessScore: number;
  message: string;
  startedAt: string;
  completedAt: string | null;
}

export interface LogEntry {
  id: number;
  type: 'authorized' | 'unknown' | 'motion' | 'manual_lock';
  name: string;
  timestamp: string;
  confidence: number | null;
  snapshot: string | null;
}

export interface Alert {
  id: number;
  timestamp: string;
  label: string;
  read: boolean;
}

export interface DashboardStats {
  todayEntries: number;
  unreadAlerts: number;
  memberCount: number;
  lastEntry: { name: string | null; timestamp: string | null };
}

// ---------------------------------------------------------------------------
// Door
// ---------------------------------------------------------------------------

export async function getDoorStatus(): Promise<{ locked: boolean }> {
  if (USE_MOCK) { await delay(300); return { ...MOCK_DOOR_STATUS }; }
  return apiGet('/door/status');
}

export async function lockDoor(): Promise<void> {
  if (USE_MOCK) { await delay(500); return; }
  await apiPost('/door/lock');
}

export async function unlockDoor(): Promise<void> {
  if (USE_MOCK) { await delay(500); return; }
  await apiPost('/door/unlock');
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export async function getStats(): Promise<DashboardStats> {
  if (USE_MOCK) {
    await delay(300);
    return { todayEntries: 0, unreadAlerts: 0, memberCount: 0, lastEntry: { name: null, timestamp: null } };
  }
  return apiGet('/stats');
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

let mockMembers: Member[] = (MOCK_MEMBERS as Member[]).map(m => ({
  ...m,
  faceEnrolled: Boolean(m.faceEnrolled),
  faceProfileVersion: m.faceProfileVersion ?? 0,
  lastEnrolledAt: m.lastEnrolledAt ?? null,
  livenessScore: m.livenessScore ?? null,
}));

export async function getMembers(): Promise<Member[]> {
  if (USE_MOCK) { await delay(300); return [...mockMembers]; }
  return apiGet('/members');
}

export async function addMember(name: string, role: string): Promise<Member> {
  if (USE_MOCK) {
    await delay(600);
    const member: Member = {
      id: Date.now().toString(), name, role,
      addedDate: new Date().toISOString(),
      faceEnrolled: false, faceProfileVersion: 0,
      lastEnrolledAt: null, livenessScore: null,
    };
    mockMembers = [...mockMembers, member];
    return member;
  }
  const client = await getApiClient();
  const res = await client.post(`/members/add?name=${encodeURIComponent(name)}`);
  return res.data as Member;
}

export async function removeMember(id: string): Promise<void> {
  if (USE_MOCK) { await delay(400); mockMembers = mockMembers.filter(m => m.id !== id); return; }
  await apiDelete(`/members/${id}`);
}

// ---------------------------------------------------------------------------
// Face enrollment
// ---------------------------------------------------------------------------
// Enrollment is orchestrated by the MacBook enrollment server:
//   1. App calls startMemberFaceEnrollment() on the Pi to create a session
//   2. App calls startMacbookCapture() to trigger the MacBook webcam
//   3. MacBook server captures 3 angles, uploads them to the Pi, and completes
//   4. App polls pollMacbookCaptureStatus() until done

export async function startMemberFaceEnrollment(memberId: string): Promise<FaceEnrollmentSession> {
  if (USE_MOCK) {
    await delay(450);
    const session: FaceEnrollmentSession = {
      sessionId: `mock-face-${Date.now()}`, memberId,
      status: 'capturing', progress: 15,
      qualityScore: 0.86, livenessScore: 0.81,
      message: 'Center your face and look into the camera.',
      startedAt: new Date().toISOString(), completedAt: null,
    };
    return session;
  }
  const client = await getApiClient();
  const res = await client.post(`/members/${memberId}/face/enrollment/start`, {
    memberId, deviceId: 'mobile-app', appVersion: '1.0.0',
  });
  return res.data.session;
}

/** Tell the MacBook enrollment server to open the webcam and start capturing. */
export async function startMacbookCapture(
  memberId: string,
  sessionId: string,
): Promise<{ status: string; message: string }> {
  const res = await axios.post(`${DEFAULT_MACBOOK_BASE_URL}/enroll`, {
    memberId, sessionId,
  }, { timeout: 5000 });
  return res.data;
}

/** Poll the MacBook server for capture progress (called every ~800ms). */
export async function pollMacbookCaptureStatus(): Promise<{
  status: string;
  progress: number;
  message: string;
  member?: Member;
}> {
  const res = await axios.get(`${DEFAULT_MACBOOK_BASE_URL}/enroll/status`, { timeout: 3000 });
  return res.data;
}

export async function removeMemberFaceTemplate(memberId: string): Promise<Member> {
  if (USE_MOCK) {
    await delay(350);
    mockMembers = mockMembers.map(m => m.id !== memberId ? m : {
      ...m, faceEnrolled: false, faceProfileVersion: 0,
      lastEnrolledAt: null, livenessScore: null,
    });
    return mockMembers.find(m => m.id === memberId)!;
  }
  const client = await getApiClient();
  const res = await client.post(`/members/${memberId}/face/template/remove`);
  return res.data.member;
}

// ---------------------------------------------------------------------------
// Logs & alerts
// ---------------------------------------------------------------------------

export async function getLogs(limit = 50): Promise<LogEntry[]> {
  if (USE_MOCK) { await delay(300); return [...MOCK_LOGS] as LogEntry[]; }
  return apiGet(`/logs?limit=${limit}`);
}

export async function getAlerts(): Promise<Alert[]> {
  if (USE_MOCK) { await delay(300); return [...MOCK_ALERTS] as Alert[]; }
  return apiGet('/alerts');
}

export async function markAlertRead(id: number): Promise<void> {
  if (USE_MOCK) { await delay(200); return; }
  await apiPost(`/alerts/${id}/read`);
}

// ---------------------------------------------------------------------------
// Settings (synced to Pi)
// ---------------------------------------------------------------------------

export async function setConfidenceThreshold(threshold: number): Promise<void> {
  await apiPost(`/settings/confidence?threshold=${threshold}`);
}

export async function getConfidenceThreshold(): Promise<number> {
  const data = await apiGet<{ confidenceThreshold: number }>('/settings/confidence');
  return data.confidenceThreshold;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function pingPi(): Promise<boolean> {
  if (USE_MOCK) return false;
  try {
    await apiGet('/health', 2000);
    return true;
  } catch {
    return false;
  }
}
