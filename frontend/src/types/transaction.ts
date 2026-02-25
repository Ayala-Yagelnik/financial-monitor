// types/transaction.ts
// All project types in one place

export type TransactionStatus = 'Pending' | 'Completed' | 'Failed';

export interface Transaction {
  transactionId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  timestamp: string; // ISO 8601 string
}

// Status enum for filters
export const TRANSACTION_STATUSES: TransactionStatus[] = ['Pending', 'Completed', 'Failed'];

// Colors by status - centralized theme
export const STATUS_CONFIG: Record<TransactionStatus, { 
  color: string; 
  bg: string; 
  label: string 
}> = {
  Pending:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'PENDING'   },
  Completed: { color: '#10b981', bg: 'rgba(16,185,129,0.12)',  label: 'COMPLETED' },
  Failed:    { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   label: 'FAILED'    },
};
