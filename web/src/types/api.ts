export type PatientCategory = 'DESERVING' | 'POOR' | 'MEMBER' | 'GENERAL';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export type TokenStatus = 'ACTIVE' | 'RETURNED' | 'REFUNDED' | 'CANCELLED';

export type TokenType = 'REGISTRATION' | 'PHARMACY' | 'LAB' | 'REFERRAL';

export type ReservationStatus =
  | 'ACTIVE'
  | 'CONSUMED'
  | 'RELEASED'
  | 'EXPIRED';

/** Money / qty values arrive as strings from Prisma Decimal JSON. */
export type DecimalString = string;

export interface Patient {
  id: string;
  branchId: string;
  mrNo: string;
  name: string;
  gender: Gender;
  dateOfBirth: string | null;
  ageYears: number | null;
  phone: string | null;
  cnic: string | null;
  address: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  linkedPatientId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  name: string;
  barcode: string | null;
  categoryId: string;
  categoryName?: string;
  tracksStock: boolean;
  /** From BranchItemPrice for this branch — display only; do not re-resolve. */
  purchasePrice: DecimalString;
  priceDeserving: DecimalString;
  pricePoor: DecimalString;
  priceMember: DecimalString;
  priceGeneral: DecimalString;
  /** Server-resolved for the requested patientCategory. */
  unitPrice: DecimalString;
  available?: DecimalString;
}

export interface ItemUnitPrice {
  itemId: string;
  unitPrice: DecimalString;
  purchasePrice: DecimalString;
  priceDeserving: DecimalString;
  pricePoor: DecimalString;
  priceMember: DecimalString;
  priceGeneral: DecimalString;
}

export interface RegistrationFee {
  branchId: string;
  category: PatientCategory;
  amount: DecimalString;
}

export interface StaffMember {
  id: string;
  fullName: string;
  designation: string | null;
  isDoctor: boolean;
}

export interface CreatePatientInput {
  name: string;
  gender: Gender;
  dateOfBirth?: string;
  ageYears?: number;
  phone?: string;
  cnic?: string;
  address?: string;
  guardianName?: string;
  guardianPhone?: string;
}

export interface PatientHistoryLine {
  itemName: string;
  quantity: DecimalString;
  dose: number;
  feed: DecimalString;
  days: number;
  fixDose: number;
}

export interface PatientHistoryToken {
  tokenDate: string;
  tokenNo: number;
  tokenType: TokenType;
  category: PatientCategory;
  doctorName: string;
  status: TokenStatus;
  createdAt: string;
  lines: PatientHistoryLine[];
}

export interface PatientWithTokens extends Patient {
  tokens: PatientHistoryToken[];
}

export interface PatientListResponse {
  total: number;
  page: number;
  limit: number;
  data: Patient[];
}

export interface TokenListResponse {
  total: number;
  page: number;
  limit: number;
  data: Array<{
    id: string;
    branchId: string;
    tokenNo: number;
    tokenDate: string;
    patientId: string;
    doctorId: string;
    tokenType: TokenType;
    tokenFee: DecimalString;
    category: PatientCategory;
    totalAmount: DecimalString;
    amountReceived: DecimalString;
    previousTokenId: string | null;
    status: TokenStatus;
    createdAt: string;
    patient?: Pick<
      Patient,
      'id' | 'mrNo' | 'name' | 'gender' | 'ageYears' | 'phone'
    >;
    doctor?: { id: string; fullName: string };
  }>;
}

export interface StockRow {
  itemId: string;
  itemName: string;
  onHand: DecimalString;
  reserved: DecimalString;
  available: DecimalString;
  minLimit: number;
  maxLimit: number;
}

export interface ReservationCreateResult extends Partial<Reservation> {
  skipped?: boolean;
  reason?: string;
  itemId?: string;
  cartId?: string;
}

export interface TokenLine {
  id: string;
  tokenId: string;
  itemId: string;
  dose: number;
  feed: DecimalString;
  days: number;
  fixDose: number;
  quantity: DecimalString;
  unitPrice: DecimalString;
  lineTotal: DecimalString;
  purchasePrice: DecimalString;
  item?: Pick<Item, 'id' | 'name' | 'barcode' | 'tracksStock'>;
}

export interface Token {
  id: string;
  branchId: string;
  tokenNo: number;
  tokenDate: string;
  patientId: string;
  doctorId: string;
  tokenType: TokenType;
  tokenFee: DecimalString;
  category: PatientCategory;
  totalAmount: DecimalString;
  amountReceived: DecimalString;
  previousTokenId: string | null;
  status: TokenStatus;
  createdAt: string;
  lines?: TokenLine[];
  patient?: Patient;
  doctor?: {
    id: string;
    fullName: string;
    designation?: string | null;
  };
}

export interface Reservation {
  id: string;
  branchId: string;
  itemId: string;
  quantity: DecimalString;
  cartId: string;
  status: ReservationStatus;
  expiresAt: string;
  tokenId: string | null;
  createdAt: string;
  skipped?: boolean;
  reason?: string;
}

export interface HealthResponse {
  ok: true;
  at: string;
}
