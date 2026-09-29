import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampusStore } from "./store";
import type {
  AccessAction,
  CampusActor,
  CampusRole,
  CampusSearchQuery,
  StudentProfileRecord,
} from "./types";

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string;
  index_number: string;
  student_id: string | null;
  faculty: string | null;
  department: string | null;
  programme: string | null;
  level: string | null;
  gpa: number | string | null;
  profile_photo_url: string | null;
  qr_token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapProfile(row: ProfileRow): StudentProfileRecord {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    indexNumber: row.index_number,
    studentId: row.student_id,
    faculty: row.faculty,
    department: row.department,
    programme: row.programme,
    level: row.level,
    gpa: row.gpa == null ? null : Number(row.gpa),
    profilePhotoUrl: row.profile_photo_url,
    qrToken: row.qr_token,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseCampusStore(admin: SupabaseClient): CampusStore {
  return {
    async getActor(userId: string): Promise<CampusActor | null> {
      const { data, error } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      const roles = (data ?? [])
        .map((row) => row.role)
        .filter((role): role is CampusRole =>
          role === "student" || role === "lecturer" || role === "advisor" || role === "admin",
        );
      if (!roles.length) return { userId, roles: ["student"] };
      return { userId, roles };
    },

    async getProfileById(id) {
      const { data, error } = await admin.from("student_profiles").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapProfile(data as ProfileRow) : null;
    },

    async getProfileByUserId(userId) {
      const { data, error } = await admin
        .from("student_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapProfile(data as ProfileRow) : null;
    },

    async getProfileByQrToken(token) {
      const { data, error } = await admin
        .from("student_profiles")
        .select("*")
        .eq("qr_token", token)
        .maybeSingle();
      if (error) throw error;
      return data ? mapProfile(data as ProfileRow) : null;
    },

    async getProfileByStudentId(studentId) {
      const { data, error } = await admin
        .from("student_profiles")
        .select("*")
        .eq("student_id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapProfile(data as ProfileRow) : null;
    },

    async relations(actorUserId, studentProfileId) {
      const [{ data: lecturer }, { data: advisor }] = await Promise.all([
        admin
          .from("lecturer_assignments")
          .select("id")
          .eq("lecturer_user_id", actorUserId)
          .eq("student_profile_id", studentProfileId)
          .maybeSingle(),
        admin
          .from("advisor_assignments")
          .select("id")
          .eq("advisor_user_id", actorUserId)
          .eq("student_profile_id", studentProfileId)
          .maybeSingle(),
      ]);
      return {
        lecturerOf: Boolean(lecturer),
        advisorOf: Boolean(advisor),
      };
    },

    async search(query: CampusSearchQuery, opts) {
      let builder = admin.from("student_profiles").select("*");
      if (query.name?.trim()) builder = builder.ilike("full_name", `%${query.name.trim()}%`);
      if (query.indexNumber?.trim()) builder = builder.eq("index_number", query.indexNumber.trim());
      if (query.studentId?.trim()) builder = builder.eq("student_id", query.studentId.trim());
      if (query.faculty?.trim()) builder = builder.ilike("faculty", `%${query.faculty.trim()}%`);
      if (query.department?.trim()) builder = builder.ilike("department", `%${query.department.trim()}%`);
      if (query.programme?.trim()) builder = builder.ilike("programme", `%${query.programme.trim()}%`);
      const { data, error } = await builder.limit(opts.limit);
      if (error) throw error;
      return (data ?? []).map((row) => mapProfile(row as ProfileRow));
    },

    async rotateQrToken(userId, token) {
      const { data, error } = await admin
        .from("student_profiles")
        .update({ qr_token: token })
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data ? mapProfile(data as ProfileRow) : null;
    },

    async writeAudit(entry: {
      requesterUserId: string;
      studentId: string;
      action: AccessAction;
    }) {
      const { error } = await admin.from("student_access_logs").insert({
        requester_user_id: entry.requesterUserId,
        student_id: entry.studentId,
        action: entry.action,
      });
      if (error) throw error;
    },
  };
}
