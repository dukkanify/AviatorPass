/**
 * Live classes durable store (.data/aep-classes.json).
 * Reminders live in the indexed class reminder store so dashboard class
 * reads never hydrate tens of thousands of queue rows.
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import { listAllReminders, replaceAllReminders } from "@/lib/data/lms-class-reminder-store";
import type {
  AttendanceRecord,
  LiveClass,
  MeetingParticipant,
  MeetingRecording,
  ReminderQueueItem,
  RecurringRule,
  ZoomMeetingRecord,
} from "@/types/classes";

export interface ClassesDatabase {
  classes: LiveClass[];
  zoomMeetings: ZoomMeetingRecord[];
  recurringRules: RecurringRule[];
  attendance: AttendanceRecord[];
  participants: MeetingParticipant[];
  recordings: MeetingRecording[];
  reminders: ReminderQueueItem[];
  seeded: boolean;
}

function dataFile() {
  return path.join(dataDir(), "aep-classes.json");
}

function emptyDb(): ClassesDatabase {
  return {
    classes: [],
    zoomMeetings: [],
    recurringRules: [],
    attendance: [],
    participants: [],
    recordings: [],
    reminders: [],
    seeded: false,
  };
}

function normalizeDb(raw: Partial<ClassesDatabase>): ClassesDatabase {
  return {
    ...emptyDb(),
    ...raw,
    classes: raw.classes ?? [],
    zoomMeetings: raw.zoomMeetings ?? [],
    recurringRules: raw.recurringRules ?? [],
    attendance: raw.attendance ?? [],
    participants: raw.participants ?? [],
    recordings: raw.recordings ?? [],
    reminders: raw.reminders ?? [],
    seeded: Boolean(raw.seeded),
  };
}

function catalogSnapshot(db: ClassesDatabase): ClassesDatabase {
  return {
    classes: db.classes,
    zoomMeetings: db.zoomMeetings,
    recurringRules: db.recurringRules,
    attendance: db.attendance,
    participants: db.participants,
    recordings: db.recordings,
    reminders: [],
    seeded: db.seeded,
  };
}

function persistCatalog(db: ClassesDatabase): void {
  writeJsonFile(dataFile(), catalogSnapshot(db));
}

function extractEmbeddedReminders(db: ClassesDatabase): void {
  const embedded = db.reminders ?? [];
  if (embedded.length === 0) return;
  const existing = listAllReminders();
  const merged = existing.length > 0 ? [...existing, ...embedded] : embedded;
  replaceAllReminders(merged);
  db.reminders = [];
  persistCatalog(db);
}

function withReminderView(db: ClassesDatabase): ClassesDatabase {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "reminders") return listAllReminders();
      return Reflect.get(target, prop, receiver);
    },
  });
}

function withLazyReminderWrites(catalog: ClassesDatabase): {
  working: ClassesDatabase;
  flushReminders: () => void;
} {
  let remindersLoaded = false;
  let reminders: ReminderQueueItem[] = [];
  const working = { ...catalog, reminders: [] };
  Object.defineProperty(working, "reminders", {
    configurable: true,
    enumerable: true,
    get() {
      if (!remindersLoaded) {
        reminders = listAllReminders();
        remindersLoaded = true;
      }
      return reminders;
    },
    set(value: ReminderQueueItem[]) {
      reminders = Array.isArray(value) ? value : [];
      remindersLoaded = true;
    },
  });
  return {
    working,
    flushReminders() {
      if (remindersLoaded) replaceAllReminders(reminders);
    },
  };
}

export function ensureClassesStore(): ClassesDatabase {
  const db = normalizeDb(readJsonFile<Partial<ClassesDatabase>>(dataFile(), emptyDb));
  extractEmbeddedReminders(db);
  db.reminders = [];
  return db;
}

export function readClassesDb(): ClassesDatabase {
  return withReminderView(ensureClassesStore());
}

export function writeClassesDb(mutator: (db: ClassesDatabase) => void): ClassesDatabase {
  const catalog = ensureClassesStore();
  const { working, flushReminders } = withLazyReminderWrites(catalog);
  mutator(working);
  flushReminders();
  const persisted = catalogSnapshot(working);
  persistCatalog(persisted);
  return withReminderView(persisted);
}

export {
  listAllReminders,
  listDueReminders,
  listRemindersForClass,
} from "@/lib/data/lms-class-reminder-store";
