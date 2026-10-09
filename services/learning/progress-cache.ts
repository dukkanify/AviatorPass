const progressByStudent = new Map<string, unknown>();

export function readProgressCache<T>(studentId: string): T | undefined {
  return progressByStudent.get(studentId) as T | undefined;
}

export function writeProgressCache<T>(studentId: string, value: T): T {
  progressByStudent.set(studentId, value);
  return value;
}

export function clearProgressCache() {
  progressByStudent.clear();
}
