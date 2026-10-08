import { ROLES, type Role } from "@/constants/roles";

export const CREATABLE_ROLES = [
  ROLES.STUDENT,
  ROLES.INSTRUCTOR,
  ROLES.CHIEF_GROUND_INSTRUCTOR,
  ROLES.ADMIN,
] as const;

export type CreatableRole = (typeof CREATABLE_ROLES)[number];

export function creatableRolesFor(actor: Role): CreatableRole[] {
  if (actor === ROLES.SUPER_ADMIN) return [...CREATABLE_ROLES];
  if (actor === ROLES.ADMIN) return [ROLES.STUDENT, ROLES.INSTRUCTOR];
  return [];
}

export function defaultCreateLabel(role?: Role | null): string {
  if (role === ROLES.INSTRUCTOR) return "Create instructor";
  if (role === ROLES.STUDENT) return "Add student";
  if (role === ROLES.ADMIN) return "Create admin";
  if (role === ROLES.CHIEF_GROUND_INSTRUCTOR) return "Add chief ground instructor";
  return "Invite user";
}
