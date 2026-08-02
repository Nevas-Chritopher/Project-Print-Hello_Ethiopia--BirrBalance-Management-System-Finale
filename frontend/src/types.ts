/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'manager' | 'cafe' | 'employee' | 'waiter';

export interface User {
  id: string;
  employeeId: string;
  fullName: string;
  role: UserRole;
  email: string;
  phone: string;
  department: string;
  photo?: string;
  balance: number; // in ETB
  monthlyAllocation: number; // in ETB
  balanceTier: string; // e.g. "Tier 1", "Tier 2"
  validityStart?: string;
  validityEnd?: string;
  isActive: boolean;
  isAwaitingSetup?: boolean;
  uuid?: string;
  encryptedQrToken?: string;
}

export interface Department {
  id: string;
  name: string;
  employeeCount: number;
  totalAllocated: number; // in ETB
  totalRedeemed: number; // in ETB
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number; // in ETB
  category: 'Food' | 'Beverage' | 'Snack';
  photo: string;
  available: boolean;
}

export type OrderStatus = 'pending' | 'ready' | 'confirmed' | 'expired';

export interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  items: OrderItem[];
  amount: number; // in ETB
  waiterName: string;
  status: OrderStatus;
  date: string; // ISO date or simple string
  location?: string;
  comment?: string;
  rating?: number;
}

export interface Feedback {
  id: string;
  employeeName: string;
  cafe: string;
  orderId: string;
  rating: number; // 1-5
  comment: string;
  date: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  employeeId: string;
  userName: string;
  role: string;
  action: string;
  details: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  timestamp: string;
  isSentByMe?: boolean;
}

export interface Conversation {
  id: string;
  avatar: string;
  name: string;
  role: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
}

export interface WaiterPerformance {
  id: string;
  name: string;
  avatar: string;
  totalOrders: number;
  avgDeliveryTime: string; // e.g., "12 mins"
  flaggedIssues: number;
  rating: number; // 1-5
}
