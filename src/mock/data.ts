// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — used when Pi is not connected
// When the Pi is running, set USE_MOCK = false in src/services/api.ts
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_MEMBERS = [
  {
    id: '1',
    name: 'Alex Rivera',
    role: 'Owner',
    addedDate: '2025-01-12',
    faceEnrolled: true,
    faceProfileVersion: 2,
    lastEnrolledAt: '2025-03-01T11:10:00Z',
    livenessScore: 0.93,
  },
  {
    id: '2',
    name: 'Jordan Kim',
    role: 'Member',
    addedDate: '2025-02-03',
    faceEnrolled: false,
    faceProfileVersion: 0,
    lastEnrolledAt: null,
    livenessScore: null,
  },
  {
    id: '3',
    name: 'Sam Patel',
    role: 'Member',
    addedDate: '2025-03-08',
    faceEnrolled: true,
    faceProfileVersion: 1,
    lastEnrolledAt: '2025-03-08T19:22:00Z',
    livenessScore: 0.9,
  },
];

export const MOCK_LOGS = [
  { id: 1,  type: 'authorized',   name: 'Alex Rivera',    timestamp: '2025-03-04T10:42:00', confidence: 0.97, hasSnapshot: true },
  { id: 2,  type: 'unknown',      name: 'Unknown Person', timestamp: '2025-03-04T10:26:00', confidence: 0.21, hasSnapshot: true },
  { id: 3,  type: 'authorized',   name: 'Jordan Kim',     timestamp: '2025-03-04T09:44:00', confidence: 0.94, hasSnapshot: true },
  { id: 4,  type: 'motion',       name: 'Motion Only',    timestamp: '2025-03-04T08:51:00', confidence: null, hasSnapshot: false },
  { id: 5,  type: 'authorized',   name: 'Sam Patel',      timestamp: '2025-03-04T07:38:00', confidence: 0.91, hasSnapshot: true },
  { id: 6,  type: 'unknown',      name: 'Unknown Person', timestamp: '2025-03-03T23:14:00', confidence: 0.18, hasSnapshot: true },
  { id: 7,  type: 'manual_lock',  name: 'App User',       timestamp: '2025-03-03T22:00:00', confidence: null, hasSnapshot: false },
];

export const MOCK_ALERTS = [
  { id: 1, timestamp: '2025-03-04T10:26:00', label: 'Unknown face detected',    read: false },
  { id: 2, timestamp: '2025-03-03T23:14:00', label: 'Unknown face detected',    read: false },
  { id: 3, timestamp: '2025-03-01T15:22:00', label: 'Motion detected — no face', read: true  },
  { id: 4, timestamp: '2025-02-28T09:05:00', label: 'Unknown face detected',    read: true  },
];

export const MOCK_DOOR_STATUS = { locked: true };
