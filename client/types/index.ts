export type UserRole = 'admin' | 'manager' | 'cashier';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BusinessSettings {
  id: string;
  businessName: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  currencySymbol: string;
  taxPercentage: number;
  receiptFooter: string;
  invoicePrefix: string;
  lowStockDefaultThreshold: number;
  theme: 'light' | 'dark';
  logoDataUrl?: string;
  mongoDbUriConfigured?: string;
  updatedAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  category: 'Retail' | 'Wholesale' | 'Corporate' | 'Residential';
  openingBalance: number;
  currentBalance: number;
  notes?: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  categoryId?: string;
  categoryName: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  unit: string;
  barcode?: string;
  lowStockThreshold: number;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  movementType: 'sale' | 'purchase' | 'adjustment' | 'return' | string;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceId?: string;
  reason?: string;
  createdByName?: string;
  createdAt: string;
}

export interface InvoiceItem {
  id?: string;
  invoiceId?: string;
  productId: string;
  productName: string;
  sku?: string;
  unit: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  discountAmount: number;
  totalAmount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId?: string | null;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  isWalkIn: number;
  subtotal: number;
  discountType: 'fixed' | 'percent' | string;
  discountValue: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  paymentMethod: string;
  paymentStatus: 'Paid' | 'Partially Paid' | 'Unpaid' | 'Cancelled' | string;
  notes?: string;
  createdById?: string;
  createdByName: string;
  isCancelled: number;
  cancelReason?: string;
  cancelledAt?: string;
  cancelledByName?: string;
  createdAt: string;
  updatedAt: string;
  items?: InvoiceItem[];
  payments?: Payment[];
}

export interface Payment {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  createdById?: string;
  createdByName: string;
  isVoided: number;
  voidReason?: string;
  voidedAt?: string;
  voidedByName?: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  customerId: string;
  transactionType: 'OPENING_BALANCE' | 'INVOICE' | 'PAYMENT' | 'RETURN' | 'ADJUSTMENT' | string;
  referenceId?: string | null;
  referenceNumber?: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  paymentMethod?: string;
  createdAt: string;
}

export interface CustomerMonthlySummary {
  customer: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    category: string;
    overallBalance: number;
  };
  period: {
    label: string;
    startDate: string;
    endDate: string;
  };
  summary: {
    openingBalance: number;
    invoiceCount: number;
    totalQuantitySold: number;
    grossSales: number;
    discounts: number;
    returns: number;
    netSales: number;
    paymentsReceived: number;
    directCashPaidAtSale: number;
    previousUnpaidBalance: number;
    totalAmountDue: number;
    closingBalance: number;
  };
  invoices: Invoice[];
  payments: Payment[];
  ledgerEntries: LedgerEntry[];
}

export interface Supplier {
  id: string;
  name: string;
  company?: string;
  phone: string;
  email?: string;
  address?: string;
  openingBalance: number;
  currentBalance: number;
  notes?: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  id?: string;
  purchaseId?: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalAmount: number;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: 'Paid' | 'Partially Paid' | 'Unpaid' | string;
  paymentMethod: string;
  notes?: string;
  createdById?: string;
  createdByName: string;
  createdAt: string;
  items?: PurchaseItem[];
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  paymentMethod: string;
  date: string;
  description?: string;
  createdById?: string;
  createdByName: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  userName: string;
  action: string;
  module: string;
  targetId?: string;
  details: string;
  ipAddress?: string;
  createdAt: string;
}

export interface DashboardStats {
  todaySales: number;
  todayInvoicesCount: number;
  monthlySales: number;
  totalReceived: number;
  outstandingBalance: number;
  totalExpenses: number;
  estimatedProfit: number;
  totalCustomers: number;
  totalInvoices: number;
  lowStockCount: number;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    customerName: string;
    grandTotal: number;
    paidAmount: number;
    balanceAmount: number;
    paymentStatus: string;
    createdAt: string;
  }>;
  topCustomers: Array<{
    customerId: string;
    customerName: string;
    invoiceCount: number;
    totalSpent: number;
  }>;
  lowStockItems: Array<{
    id: string;
    name: string;
    sku: string;
    stockQuantity: number;
    unit: string;
    lowStockThreshold: number;
  }>;
}
