/**
 * The collections the API exposes, and how each maps onto a Prisma model.
 *
 * The frontend consumes these shapes directly (camelCase fields, JSON columns
 * already parsed, `files` as a dictionary, `settings` as one object), so this
 * table is the contract between the two halves of the app.
 */

export interface CollectionSpec {
  /** Prisma model name. */
  model: string;
  /** Which permission page governs this collection. */
  page: string;
  /** Fields persisted as JSON strings and returned parsed. */
  json?: string[];
  /** Fields never returned to a client. */
  secret?: string[];
  /** Returned as { id: record } rather than an array. */
  dict?: boolean;
  /** Returned as a single object (key/value store). */
  object?: boolean;
}

export const COLLECTIONS: Record<string, CollectionSpec> = {
  students: { model: 'Student', page: 'students' },
  buildings: { model: 'Building', page: 'master' },
  rooms: { model: 'Room', page: 'master' },
  allocations: { model: 'Allocation', page: 'students' },
  attendance: { model: 'Attendance', page: 'attendance' },
  movements: { model: 'Movement', page: 'movements' },
  violations: { model: 'Violation', page: 'violations', json: ['attachments', 'history'] },
  complaints: { model: 'Complaint', page: 'complaints', json: ['attachments', 'comments'] },
  requests: { model: 'Request', page: 'requests', json: ['history'] },
  documents: { model: 'Document', page: 'documents' },
  files: { model: 'StoredFile', page: 'documents', dict: true },
  calendar: { model: 'CalendarEvent', page: 'calendar' },
  notifications: { model: 'Notification', page: 'notifications' },
  audit: { model: 'AuditEntry', page: 'audit' },
  master: { model: 'MasterValue', page: 'master' },
  roles: { model: 'Role', page: 'roles', json: ['perms'] },
  users: { model: 'User', page: 'roles', secret: ['passwordHash', 'entraOid'] },
  settings: { model: 'Setting', page: 'dashboard', object: true }
};

export const COLLECTION_NAMES = Object.keys(COLLECTIONS);

export const isCollection = (name: string): boolean =>
  Object.prototype.hasOwnProperty.call(COLLECTIONS, name);

/** Every action each page can grant, mirrored by the frontend's page catalogue. */
export const PAGE_ACTIONS: Record<string, string[]> = {
  dashboard: [],
  students: ['add', 'edit', 'deactivate', 'allocate', 'export'],
  attendance: ['record', 'edit', 'export'],
  movements: ['record', 'return', 'export'],
  violations: ['add', 'update', 'close', 'export'],
  complaints: ['add', 'update', 'comment', 'export'],
  requests: ['add', 'approve', 'reject', 'export'],
  documents: ['upload', 'delete', 'export'],
  calendar: ['add', 'delete'],
  notifications: ['announce'],
  reports: ['export'],
  audit: ['export'],
  master: ['add', 'edit', 'delete'],
  roles: ['add', 'edit'],
  integration: []
};
