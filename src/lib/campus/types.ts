export const CAMPUS_ROLES = ["student", "lecturer", "advisor", "admin"] as const;
export type CampusRole = (typeof CAMPUS_ROLES)[number];

export type PrivacyMode = "public" | "verified" | "academic";

export type AccessAction =
  | "PROFILE_VIEWED"
  | "ACADEMIC_INFO_VIEWED"
  | "STUDENT_VERIFIED"
  | "STUDENT_SEARCHED";

export type StudentProfileRecord = {
  id: string;
  userId: string;
  fullName: string;
  indexNumber: string;
  studentId: string | null;
  faculty: string | null;
  department: string | null;
  programme: string | null;
  level: string | null;
  gpa: number | null;
  profilePhotoUrl: string | null;
  qrToken: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StudentIdentityCard = {
  id: string;
  fullName: string;
  indexNumber: string;
  studentId: string | null;
  faculty: string | null;
  department: string | null;
  programme: string | null;
  level: string | null;
  profilePhotoUrl: string | null;
};

export type StudentAcademicCard = StudentIdentityCard & {
  gpa: number | null;
};

export type AuthorizedStudentView =
  | { mode: "verified"; profile: StudentIdentityCard }
  | { mode: "academic"; profile: StudentAcademicCard };

export type CampusActor = {
  userId: string;
  roles: CampusRole[];
};

export type CampusSearchQuery = {
  name?: string;
  indexNumber?: string;
  studentId?: string;
  faculty?: string;
  department?: string;
  programme?: string;
};

export type CampusSearchHit = StudentIdentityCard & {
  gpa?: number | null;
};

export type VerifyInput = {
  qrToken?: string;
  studentId?: string;
};

export type VerifyFailureReason =
  | "unauthenticated"
  | "invalid_token"
  | "not_found"
  | "inactive"
  | "denied";

export type VerifyResult =
  | { ok: true; action: "STUDENT_VERIFIED"; view: AuthorizedStudentView }
  | { ok: false; reason: VerifyFailureReason };

export type QrPayloadParse =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid_token" };
