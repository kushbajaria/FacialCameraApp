// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — used when Pi is not connected (hardware pending)
// When your Pi is running, set USE_MOCK = false in src/services/api.ts
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_MEMBERS = [
  { id: '1', name: 'Alex Rivera', role: 'Owner', addedDate: '2025-01-12' },
  { id: '2', name: 'Jordan Kim',  role: 'Member', addedDate: '2025-02-03' },
  { id: '3', name: 'Sam Patel',   role: 'Member', addedDate: '2025-03-08' },
];

export const MOCK_LOGS = [
  { id: 1,  type: 'authorized',   name: 'Alex Rivera',    timestamp: '2025-03-04T10:42:00', confidence: 0.97, snapshot: null },
  { id: 2,  type: 'unknown',      name: 'Unknown Person', timestamp: '2025-03-04T10:26:00', confidence: 0.21, snapshot: null },
  { id: 3,  type: 'authorized',   name: 'Jordan Kim',     timestamp: '2025-03-04T09:44:00', confidence: 0.94, snapshot: null },
  { id: 4,  type: 'motion',       name: 'Motion Only',    timestamp: '2025-03-04T08:51:00', confidence: null, snapshot: null },
  { id: 5,  type: 'authorized',   name: 'Sam Patel',      timestamp: '2025-03-04T07:38:00', confidence: 0.91, snapshot: null },
  { id: 6,  type: 'unknown',      name: 'Unknown Person', timestamp: '2025-03-03T23:14:00', confidence: 0.18, snapshot: null },
  { id: 7,  type: 'manual_lock',  name: 'App User',       timestamp: '2025-03-03T22:00:00', confidence: null, snapshot: null },
];

export const MOCK_ALERTS = [
  { id: 1, timestamp: '2025-03-04T10:26:00', label: 'Unknown face detected',    read: false },
  { id: 2, timestamp: '2025-03-03T23:14:00', label: 'Unknown face detected',    read: false },
  { id: 3, timestamp: '2025-03-01T15:22:00', label: 'Motion detected — no face', read: true  },
  { id: 4, timestamp: '2025-02-28T09:05:00', label: 'Unknown face detected',    read: true  },
];

export const MOCK_DOOR_STATUS = { locked: true };
