export enum UserRole {
  ADMIN = 'ADMIN',
  MECHANIC = 'MECHANIC',
  CLIENT = 'CLIENT'
}

export enum OSStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_PARTS = 'WAITING_PARTS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  cpf?: string;
  phone?: string;
  address?: string;
  city?: string;
  cep?: string;
  role: UserRole;
  points: number;
  birthDate?: string;
  createdAt: any;
}

export interface Vehicle {
  id?: string;
  clientId: string;
  type: 'CAR' | 'MOTORCYCLE';
  licensePlate: string;
  brand: string;
  model: string;
  year?: number;
  color?: string;
  engine?: string;
  mileage?: number;
  notes?: string;
  createdAt?: any;
}

export interface ServiceItem {
  id?: string;
  name: string;
  price: number;
  rewardPoints: number;
  maintenanceIntervalMonths?: number;
  maintenanceIntervalKm?: number;
}

export interface WorkOrder {
  id?: string;
  seqId?: string;
  clientId: string;
  vehicleId: string;
  mechanicId?: string;
  mechanicName?: string;
  services: string[]; // Keep for legacy
  items?: { description: string; price: number }[];
  status: OSStatus;
  totalValue: number;
  totalPoints: number;
  notes?: string;
  currentMileage?: number;
  photos?: string[];
  pdfUrl?: string;
  createdAt: any;
  completedAt?: any;
}

export interface Prize {
  id?: string;
  name: string;
  description: string;
  imageUrl?: string;
  pointCost: number;
  stock: number;
}

export interface Redemption {
  id?: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  prizeId: string;
  prizeName?: string;
  pointCost: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELIVERED';
  createdAt: any;
  updatedAt?: any;
}

export interface AuditLog {
  id?: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
  targetId?: string;
  timestamp: any;
}

export interface Announcement {
  id?: string;
  title: string;
  content: string;
  type: 'PUBLIC' | 'INTERNAL';
  authorId: string;
  createdAt: any;
}

export interface SystemConfig {
  logoUrl: string;
  shopName: string;
  phone?: string;
  whatsappTemplate?: string;
  whatsappBirthdayTemplate?: string;
  oilChangeIntervalMonths?: number;
  customSystemDate?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export interface ReminderRecord {
  id?: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  vehicleId?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  type: 'MAINTENANCE' | 'BIRTHDAY';
  serviceName: string;
  status: 'PENDING' | 'SENT' | 'MISSED' | 'DELAYED_SENT';
  scheduledDate: any;
  sentAt?: any;
  lastServiceDate?: any;
  lastMileage?: number;
  dueMonths?: number;
  dueKm?: number;
  createdAt: any;
}
