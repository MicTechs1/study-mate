import { generateQrToken } from "./qr";
import type { CampusStore } from "./store";
import type {
  AccessAction,
  CampusActor,
  CampusRole,
  CampusSearchQuery,
  StudentProfileRecord,
} from "./types";

type MemoryStudent = StudentProfileRecord & {
  lecturerIds: string[];
  advisorIds: string[];
};

type MemoryUser = {
  userId: string;
  roles: CampusRole[];
};

export type DevCampusSeed = {
  users: MemoryUser[];
  students: MemoryStudent[];
};

export const DEV_SEED: DevCampusSeed = {
  users: [
    { userId: "user-owen", roles: ["student"] },
    { userId: "user-ama", roles: ["student"] },
    { userId: "user-lecturer", roles: ["lecturer"] },
    { userId: "user-advisor", roles: ["advisor"] },
    { userId: "user-admin", roles: ["admin"] },
  ],
  students: [
    {
      id: "profile-owen",
      userId: "user-owen",
      fullName: "Owen Kpobi",
      indexNumber: "12345678",
      studentId: "UG-PR-400-01",
      faculty: "Faculty of Social Sciences",
      department: "Communication Studies",
      programme: "Public Relations",
      level: "Level 400",
      gpa: 3.62,
      profilePhotoUrl: null,
      qrToken: "owen-dev-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lecturerIds: ["user-lecturer"],
      advisorIds: ["user-advisor"],
    },
    {
      id: "profile-ama",
      userId: "user-ama",
      fullName: "Ama Mensah",
      indexNumber: "87654321",
      studentId: "UG-PR-300-09",
      faculty: "Faculty of Social Sciences",
      department: "Communication Studies",
      programme: "Public Relations",
      level: "Level 300",
      gpa: 2.14,
      profilePhotoUrl: null,
      qrToken: "ama-dev-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lecturerIds: [],
      advisorIds: [],
    },
    {
      id: "profile-inactive",
      userId: "user-inactive",
      fullName: "Inactive Student",
      indexNumber: "00000000",
      studentId: "UG-OFF",
      faculty: "Faculty of Social Sciences",
      department: "Communication Studies",
      programme: "Public Relations",
      level: "Level 100",
      gpa: 1.5,
      profilePhotoUrl: null,
      qrToken: "inactive-dev-token-cccccccccccccccccccccccccc",
      isActive: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lecturerIds: [],
      advisorIds: [],
    },
  ],
};

function cloneProfile(student: MemoryStudent): StudentProfileRecord {
  const { lecturerIds: _l, advisorIds: _a, ...profile } = student;
  return { ...profile };
}

export function createMemoryCampusStore(seed: DevCampusSeed = DEV_SEED): CampusStore & {
  audits: Array<{ requesterUserId: string; studentId: string; action: AccessAction }>;
} {
  const users = seed.users.map((u) => ({ ...u, roles: [...u.roles] }));
  const students = seed.students.map((s) => ({
    ...s,
    lecturerIds: [...s.lecturerIds],
    advisorIds: [...s.advisorIds],
  }));
  const audits: Array<{ requesterUserId: string; studentId: string; action: AccessAction }> = [];

  const store: CampusStore & { audits: typeof audits } = {
    audits,
    async getActor(userId) {
      const user = users.find((item) => item.userId === userId);
      return user ? { userId: user.userId, roles: [...user.roles] } : null;
    },
    async getProfileById(id) {
      const row = students.find((item) => item.id === id);
      return row ? cloneProfile(row) : null;
    },
    async getProfileByUserId(userId) {
      const row = students.find((item) => item.userId === userId);
      return row ? cloneProfile(row) : null;
    },
    async getProfileByQrToken(token) {
      const row = students.find((item) => item.qrToken === token);
      return row ? cloneProfile(row) : null;
    },
    async getProfileByStudentId(studentId) {
      const row = students.find((item) => item.studentId === studentId);
      return row ? cloneProfile(row) : null;
    },
    async relations(actorUserId, studentProfileId) {
      const row = students.find((item) => item.id === studentProfileId);
      return {
        lecturerOf: Boolean(row?.lecturerIds.includes(actorUserId)),
        advisorOf: Boolean(row?.advisorIds.includes(actorUserId)),
      };
    },
    async search(query: CampusSearchQuery, opts) {
      const q = {
        name: query.name?.trim().toLowerCase(),
        indexNumber: query.indexNumber?.trim().toLowerCase(),
        studentId: query.studentId?.trim().toLowerCase(),
        faculty: query.faculty?.trim().toLowerCase(),
        department: query.department?.trim().toLowerCase(),
        programme: query.programme?.trim().toLowerCase(),
      };
      return students
        .filter((row) => {
          if (q.name && !row.fullName.toLowerCase().includes(q.name)) return false;
          if (q.indexNumber && row.indexNumber.toLowerCase() !== q.indexNumber) return false;
          if (q.studentId && (row.studentId ?? "").toLowerCase() !== q.studentId) return false;
          if (q.faculty && !(row.faculty ?? "").toLowerCase().includes(q.faculty)) return false;
          if (q.department && !(row.department ?? "").toLowerCase().includes(q.department)) return false;
          if (q.programme && !(row.programme ?? "").toLowerCase().includes(q.programme)) return false;
          return true;
        })
        .slice(0, opts.limit)
        .map(cloneProfile);
    },
    async rotateQrToken(userId, token) {
      const row = students.find((item) => item.userId === userId);
      if (!row) return null;
      row.qrToken = token;
      row.updatedAt = new Date().toISOString();
      return cloneProfile(row);
    },
    async writeAudit(entry) {
      audits.push(entry);
    },
  };

  return store;
}

export function freshDevToken() {
  return generateQrToken();
}
