import type {
  AuthorizedStudentView,
  CampusActor,
  StudentAcademicCard,
  StudentIdentityCard,
  StudentProfileRecord,
} from "./types";
import { hasRole } from "./roles";

export type AccessDecision = {
  identity: boolean;
  academic: boolean;
};

export function accessForStudent(
  actor: CampusActor,
  profile: Pick<StudentProfileRecord, "userId" | "id">,
  relations: { lecturerOf: boolean; advisorOf: boolean },
): AccessDecision {
  if (hasRole(actor, "admin")) {
    return { identity: true, academic: true };
  }
  if (actor.userId === profile.userId) {
    return { identity: true, academic: true };
  }
  if (hasRole(actor, "advisor") && relations.advisorOf) {
    return { identity: true, academic: true };
  }
  if (hasRole(actor, "lecturer") && relations.lecturerOf) {
    return { identity: true, academic: false };
  }
  return { identity: false, academic: false };
}

export function toIdentityCard(profile: StudentProfileRecord): StudentIdentityCard {
  return {
    id: profile.id,
    fullName: profile.fullName,
    indexNumber: profile.indexNumber,
    studentId: profile.studentId,
    faculty: profile.faculty,
    department: profile.department,
    programme: profile.programme,
    level: profile.level,
    profilePhotoUrl: profile.profilePhotoUrl,
  };
}

export function toAcademicCard(profile: StudentProfileRecord): StudentAcademicCard {
  return { ...toIdentityCard(profile), gpa: profile.gpa };
}

export function toAuthorizedView(
  profile: StudentProfileRecord,
  access: AccessDecision,
): AuthorizedStudentView | null {
  if (!access.identity) return null;
  if (access.academic) return { mode: "academic", profile: toAcademicCard(profile) };
  return { mode: "verified", profile: toIdentityCard(profile) };
}

export function stripAcademicFromHits(
  hits: StudentAcademicCard[],
  includeGpa: boolean,
) {
  return hits.map((hit) => {
    if (includeGpa) return hit;
    const { gpa: _gpa, ...identity } = hit;
    return identity;
  });
}
