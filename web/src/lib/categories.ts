import type { PatientCategory } from '../types/api';

export const CATEGORIES: PatientCategory[] = [
  'DESERVING',
  'POOR',
  'MEMBER',
  'GENERAL',
];

export const CATEGORY_LABEL: Record<PatientCategory, string> = {
  DESERVING: 'Deserving',
  POOR: 'Poor',
  MEMBER: 'Member',
  GENERAL: 'General',
};
