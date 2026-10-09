/**
 * Live classes durable store (.data/aep-classes.json).
 * Reminders and participants live in indexed stores so dashboard class
 * reads never hydrate the invite or reminder queues.
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import {
  listAllParticipants,
  replaceAllParticipants,
} from "@/lib/data/lms-class-participant-store";
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
    participants: [],
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
  replaceAllReminders(existing.length > 0 ? [...existing, ...embedded] : embedded);
  db.reminders = [];
  persistCatalog(db);
}

function extractEmbeddedParticipants(db: ClassesDatabase): void {
  const embedded = db.participants ?? [];
  if (embedded.length === 0) return;
  const existing = listAllParticipants();
  replaceAllParticipants(existing.length > 0 ? [...existing, ...embedded] : embedded);
  db.participants = [];
  persistCatalog(db);
}

function withIndexedView(db: ClassesDatabase): ClassesDatabase {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "reminders") return listAllReminders();
      if (prop === "participants") return listAllParticipants();
      return Reflect.get(target, prop, receiver);
    },
  });
}

function withLazyIndexedWrites(catalog: ClassesDatabase): {
  working: ClassesDatabase;
  flushIndexed: () => void;
} {
  let remindersLoaded = false;
  let reminders: ReminderQueueItem[] = [];
  let participantsLoaded = false;
  let participants: MeetingParticipant[] = [];
  const working = { ...catalog, reminders: [], participants: [] };
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
  Object.defineProperty(working, "participants", {
    configurable: true,
    enumerable: true,
    get() {
      if (!participantsLoaded) {
        participants = listAllParticipants();
        participantsLoaded = true;
      }
      return participants;
    },
    set(value: MeetingParticipant[]) {
      participants = Array.isArray(value) ? value : [];
      participantsLoaded = true;
    },
  });
  return {
    working,
    flushIndexed() {
      if (remindersLoaded) replaceAllReminders(reminders);
      if (participantsLoaded) replaceAllParticipants(participants);
    },
  };
}

export function ensureClassesStore(): ClassesDatabase {
  const db = normalizeDb(readJsonFile<Partial<ClassesDatabase>>(dataFile(), emptyDb));
  extractEmbeddedReminders(db);
  extractEmbeddedParticipants(db);
  db.reminders = [];
  db.participants = [];
  return db;
}

export function readClassesDb(): ClassesDatabase {
  return withIndexedView(ensureClassesStore());
}

export function writeClassesDb(mutator: (db: ClassesDatabase) => void): ClassesDatabase {
  const catalog = ensureClassesStore();
  const { working, flushIndexed } = withLazyIndexedWrites(catalog);
  mutator(working);
  flushIndexed();
  const persisted = catalogSnapshot(working);
  persistCatalog(persisted);
  return withIndexedView(persisted);
}

export {
  listAllReminders,
  listDueReminders,
  listRemindersForClass,
} from "@/lib/data/lms-class-reminder-store";

export {
  hasParticipant,
  listAllParticipants,
  listParticipantsForClass,
  listParticipantsForUser,
} from "@/lib/data/lms-class-participant-store";
