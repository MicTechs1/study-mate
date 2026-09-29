import type { CampusActor, CampusRole } from "./types";

export function highestRole(roles: CampusRole[]): CampusRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("advisor")) return "advisor";
  if (roles.includes("lecturer")) return "lecturer";
  if (roles.includes("student")) return "student";
  return null;
}

export function hasRole(actor: CampusActor, role: CampusRole) {
  return actor.roles.includes(role);
}

export function isStaff(actor: CampusActor) {
  return actor.roles.some((role) => role === "lecturer" || role === "advisor" || role === "admin");
}

export function canManageStudents(actor: CampusActor) {
  return hasRole(actor, "admin");
}

export function canSearchDirectory(actor: CampusActor) {
  return isStaff(actor);
}
