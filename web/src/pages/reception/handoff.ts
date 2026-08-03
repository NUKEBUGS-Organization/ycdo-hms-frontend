import type { Patient, PatientCategory } from '../../types/api';

/** Location state passed from Registration → Dispense (second-turn handoff). */
export type DispenseHandoff = {
  previousTokenId: string;
  tokenNo: number;
  patient: Patient;
  category: PatientCategory;
  doctorId: string;
};

export type LastRegistered = {
  tokenId: string;
  tokenNo: number;
  handoff: DispenseHandoff;
};
