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

// Stable backend contract for face enrollment/verification flows.
export interface StartEnrollmentRequest {
  memberId: string;
  deviceId: string;
  appVersion: string;
}

export interface StartEnrollmentResponse {
  session: FaceEnrollmentSession;
  captureGuidance: {
    minFrames: number;
    requiredAngles: Array<'front' | 'left' | 'right'>;
    minQualityScore: number;
    minLivenessScore: number;
  };
}

export interface PollEnrollmentResponse {
  session: FaceEnrollmentSession;
}

export interface CompleteEnrollmentRequest {
  memberId: string;
  sessionId: string;
}

export interface CompleteEnrollmentResponse {
  member: Member;
  template: {
    templateId: string;
    version: number;
    enrolledAt: string;
    encryptedAtRest: boolean;
  };
}

export type FaceCaptureAngle = 'front' | 'left' | 'right';

export interface FaceCaptureAsset {
  uri: string;
  type?: string;
  fileName?: string;
}

export interface RemoveFaceTemplateResponse {
  member: Member;
  removedTemplateId?: string;
}

export interface FacePipelineHealth {
  status: 'healthy' | 'degraded' | 'offline';
  modelVersion: string;
  avgInferenceMs: number;
  livenessEnabled: boolean;
  updatedAt: string;
}

let mockMembers: Member[] = (MOCK_MEMBERS as Member[]).map(m => ({
  ...m,
  faceEnrolled: Boolean(m.faceEnrolled),
  faceProfileVersion: m.faceProfileVersion ?? 0,
  lastEnrolledAt: m.lastEnrolledAt ?? null,
  livenessScore: m.livenessScore ?? null,
}));

const mockEnrollmentSessions = new Map<string, FaceEnrollmentSession>();
const mockEnrollmentCaptures = new Map<string, number>();

export async function getMembers(): Promise<Member[]> {
  if (USE_MOCK) { await delay(300); return [...mockMembers]; }
  return apiGet<Member[]>('/members');
}

export async function addMember(name: string, role: string, photo?: any): Promise<Member> {
  if (USE_MOCK) {
    await delay(600);
    const member: Member = {
      id: Date.now().toString(),
      name,
      role,
      addedDate: new Date().toISOString(),
      faceEnrolled: false,
      faceProfileVersion: 0,
      lastEnrolledAt: null,
      livenessScore: null,
    };
    mockMembers = [...mockMembers, member];
    return member;
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
  if (USE_MOCK) {
    await delay(400);
    mockMembers = mockMembers.filter(m => m.id !== id);
    return;
  }
  await apiDelete(`/members/${id}`);
}

// ── FACE ENROLLMENT ─────────────────────────────────────────────────────────
export async function startMemberFaceEnrollment(memberId: string): Promise<FaceEnrollmentSession> {
  if (USE_MOCK) {
    await delay(450);
    const session: FaceEnrollmentSession = {
      sessionId: `mock-face-${Date.now()}`,
      memberId,
      status: 'capturing',
      progress: 15,
      qualityScore: 0.86,
      livenessScore: 0.81,
      message: 'Center your face and look into the camera.',
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    mockEnrollmentSessions.set(session.sessionId, session);
    mockEnrollmentCaptures.set(session.sessionId, 0);
    return session;
  }
  const payload: StartEnrollmentRequest = {
    memberId,
    deviceId: 'mobile-app',
    appVersion: '1.0.0',
  };
  const client = await getApiClient();
  const res = await client.post(`/members/${memberId}/face/enrollment/start`, payload);
  return (res.data as StartEnrollmentResponse).session;
}

export async function pollMemberFaceEnrollment(memberId: string, sessionId: string): Promise<FaceEnrollmentSession> {
  if (USE_MOCK) {
    await delay(550);
    const session = mockEnrollmentSessions.get(sessionId);
    if (!session || session.memberId !== memberId) {
      throw new Error('Enrollment session not found');
    }
    if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
      return { ...session };
    }

    const captured = mockEnrollmentCaptures.get(sessionId) ?? 0;
    if (captured < 3) {
      const waiting: FaceEnrollmentSession = {
        ...session,
        status: 'capturing',
        progress: Math.max(session.progress, 15 + captured * 20),
        message: `Captured ${captured}/3 photos. Continue guided capture.`,
        completedAt: null,
      };
      mockEnrollmentSessions.set(sessionId, waiting);
      return waiting;
    }

    const processing = session.status !== 'processing';
    const updated: FaceEnrollmentSession = {
      ...session,
      progress: processing ? 88 : 100,
      status: processing ? 'processing' : 'completed',
      message: processing ? 'Generating secure face template...' : 'Face template generated successfully.',
      qualityScore: Math.min(0.98, session.qualityScore + 0.03),
      livenessScore: Math.min(0.96, session.livenessScore + 0.02),
      completedAt: processing ? null : new Date().toISOString(),
    };
    mockEnrollmentSessions.set(sessionId, updated);
    return updated;
  }
  const data = await apiGet<PollEnrollmentResponse>(`/members/${memberId}/face/enrollment/${sessionId}`);
  return data.session;
}

export async function uploadMemberFaceEnrollmentCapture(
  memberId: string,
  sessionId: string,
  capture: FaceCaptureAsset,
  angle: FaceCaptureAngle,
): Promise<FaceEnrollmentSession> {
  if (USE_MOCK) {
    await delay(400);
    const session = mockEnrollmentSessions.get(sessionId);
    if (!session || session.memberId !== memberId) {
      throw new Error('Enrollment session not found');
    }
    if (!capture.uri) {
      throw new Error('Face capture is missing image data.');
    }

    const captured = Math.min(3, (mockEnrollmentCaptures.get(sessionId) ?? 0) + 1);
    mockEnrollmentCaptures.set(sessionId, captured);
    const updated: FaceEnrollmentSession = {
      ...session,
      status: captured >= 3 ? 'processing' : 'capturing',
      progress: Math.min(90, 20 + captured * 25),
      message: captured >= 3
        ? 'All angles captured. Finalizing secure template...'
        : `${angle.toUpperCase()} angle captured. Capture the next angle.`,
      qualityScore: Math.min(0.98, session.qualityScore + 0.03),
      livenessScore: Math.min(0.96, session.livenessScore + 0.03),
      completedAt: null,
    };
    mockEnrollmentSessions.set(sessionId, updated);
    return updated;
  }

  const form = new FormData();
  form.append('memberId', memberId);
  form.append('sessionId', sessionId);
  form.append('angle', angle);
  form.append('image', {
    uri: capture.uri,
    type: capture.type || 'image/jpeg',
    name: capture.fileName || `face-${angle}-${Date.now()}.jpg`,
  } as any);

  const client = await getApiClient(12000);
  const res = await client.post(
    `/members/${memberId}/face/enrollment/${sessionId}/capture`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return (res.data as PollEnrollmentResponse).session;
}

export async function completeMemberFaceEnrollment(memberId: string, sessionId: string): Promise<Member> {
  if (USE_MOCK) {
    await delay(350);
    const session = mockEnrollmentSessions.get(sessionId);
    if (!session || session.memberId !== memberId || session.status !== 'completed') {
      throw new Error('Enrollment is not ready to complete.');
    }
    const updatedMembers = mockMembers.map(m => {
      if (m.id !== memberId) return m;
      return {
        ...m,
        faceEnrolled: true,
        faceProfileVersion: (m.faceProfileVersion ?? 0) + 1,
        lastEnrolledAt: new Date().toISOString(),
        livenessScore: session.livenessScore,
      };
    });
    mockMembers = updatedMembers;
    const updated = updatedMembers.find(m => m.id === memberId);
    if (!updated) throw new Error('Member not found.');
    return updated;
  }
  const payload: CompleteEnrollmentRequest = { memberId, sessionId };
  const client = await getApiClient();
  const res = await client.post(`/members/${memberId}/face/enrollment/${sessionId}/complete`, payload);
  return (res.data as CompleteEnrollmentResponse).member;
}

export async function cancelMemberFaceEnrollment(memberId: string, sessionId: string): Promise<void> {
  if (USE_MOCK) {
    await delay(200);
    const session = mockEnrollmentSessions.get(sessionId);
    if (session && session.memberId === memberId) {
      mockEnrollmentSessions.set(sessionId, { ...session, status: 'cancelled', message: 'Enrollment cancelled.' });
    }
    mockEnrollmentCaptures.delete(sessionId);
    return;
  }
  await apiDelete(`/members/${memberId}/face/enrollment/${sessionId}`);
}

export async function removeMemberFaceTemplate(memberId: string): Promise<Member> {
  if (USE_MOCK) {
    await delay(350);
    const updatedMembers = mockMembers.map(m => {
      if (m.id !== memberId) return m;
      return {
        ...m,
        faceEnrolled: false,
        faceProfileVersion: 0,
        lastEnrolledAt: null,
        livenessScore: null,
      };
    });
    mockMembers = updatedMembers;
    const updated = updatedMembers.find(m => m.id === memberId);
    if (!updated) throw new Error('Member not found.');
    return updated;
  }
  const client = await getApiClient();
  const res = await client.post(`/members/${memberId}/face/template/remove`);
  return (res.data as RemoveFaceTemplateResponse).member;
}

export async function getFacePipelineHealth(): Promise<FacePipelineHealth> {
  if (USE_MOCK) {
    await delay(250);
    return {
      status: 'healthy',
      modelVersion: 'arcface-r100-v1',
      avgInferenceMs: 118,
      livenessEnabled: true,
      updatedAt: new Date().toISOString(),
    };
  }
  return apiGet<FacePipelineHealth>('/face/health', 3000);
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
