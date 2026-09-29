import { accessForStudent, toAuthorizedView, toIdentityCard } from "./authz";
import { parseQrPayload } from "./qr";
import { canSearchDirectory, hasRole } from "./roles";
import type { CampusStore } from "./store";
import type {
  AuthorizedStudentView,
  CampusActor,
  CampusSearchHit,
  CampusSearchQuery,
  VerifyInput,
  VerifyResult,
} from "./types";

const SEARCH_LIMIT = 25;

export async function verifyCredential(
  store: CampusStore,
  actor: CampusActor,
  input: VerifyInput,
): Promise<VerifyResult> {
  const profile = await resolveVerifyTarget(store, input);
  if (profile === "invalid") return { ok: false, reason: "invalid_token" };
  if (!profile) return { ok: false, reason: "not_found" };
  if (!profile.isActive) {
    await store.writeAudit({
      requesterUserId: actor.userId,
      studentId: profile.id,
      action: "STUDENT_VERIFIED",
    });
    return { ok: false, reason: "inactive" };
  }

  const relations = await store.relations(actor.userId, profile.id);
  const access = accessForStudent(actor, profile, relations);
  const view = toAuthorizedView(profile, access);
  if (!view) return { ok: false, reason: "denied" };

  await store.writeAudit({
    requesterUserId: actor.userId,
    studentId: profile.id,
    action: view.mode === "academic" ? "ACADEMIC_INFO_VIEWED" : "STUDENT_VERIFIED",
  });
  if (view.mode === "academic") {
    await store.writeAudit({
      requesterUserId: actor.userId,
      studentId: profile.id,
      action: "PROFILE_VIEWED",
    });
  } else {
    await store.writeAudit({
      requesterUserId: actor.userId,
      studentId: profile.id,
      action: "PROFILE_VIEWED",
    });
  }
  return { ok: true, action: "STUDENT_VERIFIED", view };
}

async function resolveVerifyTarget(store: CampusStore, input: VerifyInput) {
  if (input.qrToken) {
    const opaque = parseQrPayload(input.qrToken);
    if (!opaque) return "invalid" as const;
    return store.getProfileByQrToken(opaque);
  }
  if (input.studentId?.trim()) {
    return store.getProfileByStudentId(input.studentId.trim());
  }
  return "invalid" as const;
}

export async function getOwnProfile(
  store: CampusStore,
  actor: CampusActor,
): Promise<AuthorizedStudentView | null> {
  const profile = await store.getProfileByUserId(actor.userId);
  if (!profile || !profile.isActive) return null;
  const relations = await store.relations(actor.userId, profile.id);
  const view = toAuthorizedView(profile, accessForStudent(actor, profile, relations));
  if (!view) return null;
  await store.writeAudit({
    requesterUserId: actor.userId,
    studentId: profile.id,
    action: view.mode === "academic" ? "ACADEMIC_INFO_VIEWED" : "PROFILE_VIEWED",
  });
  return view;
}

export async function searchStudents(
  store: CampusStore,
  actor: CampusActor,
  query: CampusSearchQuery,
): Promise<{ ok: true; results: CampusSearchHit[] } | { ok: false; reason: "denied" }> {
  if (!canSearchDirectory(actor)) return { ok: false, reason: "denied" };

  const records = await store.search(query, { limit: SEARCH_LIMIT, actor });
  const results: CampusSearchHit[] = [];

  for (const profile of records) {
    if (!profile.isActive && !hasRole(actor, "admin")) continue;
    const relations = await store.relations(actor.userId, profile.id);
    const access = accessForStudent(actor, profile, relations);
    if (!access.identity) continue;
    const identity = toIdentityCard(profile);
    results.push(access.academic ? { ...identity, gpa: profile.gpa } : identity);
  }

  await Promise.all(
    results.slice(0, 10).map((hit) =>
      store.writeAudit({
        requesterUserId: actor.userId,
        studentId: hit.id,
        action: "STUDENT_SEARCHED",
      }),
    ),
  );

  return { ok: true, results };
}

export function authorizedContextLine(view: AuthorizedStudentView | null): string | null {
  if (!view) return null;
  const p = view.profile;
  const parts = [
    `Verified student: ${p.fullName}.`,
    p.indexNumber ? `Index number: ${p.indexNumber}.` : "",
    p.faculty ? `Faculty: ${p.faculty}.` : "",
    p.department ? `Department: ${p.department}.` : "",
    p.programme ? `Programme: ${p.programme}.` : "",
    p.level ? `Level: ${p.level}.` : "",
  ];
  if (view.mode === "academic" && "gpa" in view.profile && view.profile.gpa != null) {
    parts.push(`GPA: ${view.profile.gpa}.`);
  }
  return parts.filter(Boolean).join(" ");
}
