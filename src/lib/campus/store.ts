import type {
  AccessAction,
  CampusActor,
  CampusSearchQuery,
  StudentProfileRecord,
  VerifyInput,
} from "./types";

export type CampusRelations = {
  lecturerOf: boolean;
  advisorOf: boolean;
};

export type CampusStore = {
  getActor(userId: string): Promise<CampusActor | null>;
  getProfileById(id: string): Promise<StudentProfileRecord | null>;
  getProfileByUserId(userId: string): Promise<StudentProfileRecord | null>;
  getProfileByQrToken(token: string): Promise<StudentProfileRecord | null>;
  getProfileByStudentId(studentId: string): Promise<StudentProfileRecord | null>;
  relations(actorUserId: string, studentProfileId: string): Promise<CampusRelations>;
  search(
    query: CampusSearchQuery,
    opts: { limit: number; actor: CampusActor },
  ): Promise<StudentProfileRecord[]>;
  rotateQrToken(userId: string, token: string): Promise<StudentProfileRecord | null>;
  writeAudit(entry: {
    requesterUserId: string;
    studentId: string;
    action: AccessAction;
  }): Promise<void>;
};
