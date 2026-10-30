import type {
  BusinessSettings,
  Customer,
  CustomerMonthlySummary,
  DashboardStats,
  Expense,
  Invoice,
  Payment,
  Product,
  Purchase,
  Supplier,
  User,
} from '../types';

export const AUTH_TOKEN_KEY = 'freshway_auth_bearer_token';

// Base URL for API calls when Frontend (Vercel) and Backend (Render) are hosted separately.
// Leave empty in local development or unified hosting to use same-origin '/api'.
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {}
}

function resolveApiUrl(url: string | URL): string {
  const raw = url.toString();
  if (!API_BASE_URL) {
    return raw;
  }
  if (raw.startsWith('/api')) {
    return `${API_BASE_URL}${raw}`;
  }
  if (typeof window !== 'undefined' && raw.startsWith(window.location.origin + '/api')) {
    return `${API_BASE_URL}${raw.slice(window.location.origin.length)}`;
  }
  return raw;
}

async function secureFetch(url: string | URL, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  const token = getStoredToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(resolveApiUrl(url), {
    ...options,
    headers,
  });
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `Server error (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) errorMsg = data.error;
    } catch {
      // ignore json parse error
    }
    if (res.status === 401 && !res.url.includes('/api/auth/login')) {
      window.dispatchEvent(new CustomEvent('freshway:unauthorized'));
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

export const api = {
  // Auth
  async getAuthStatus(): Promise<{
    needsSetup: boolean;
    userCount: number;
    settings: BusinessSettings | null;
    database?: { mongo?: any };
  }> {
    const res = await secureFetch('/api/auth/status');
    return handleResponse(res);
  },

  async getCurrentUser(): Promise<{ authenticated: boolean; user: User }> {
    const res = await secureFetch('/api/auth/me');
    return handleResponse(res);
  },

  async setupAdmin(data: any): Promise<{ success: boolean; token: string; user: User }> {
    const res = await secureFetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; token: string; user: User }>(res);
    if (result.token) {
      setStoredToken(result.token);
    }
    return result;
  },

  async login(username: string, password: string): Promise<{ success: boolean; token: string; user: User }> {
    const res = await secureFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const result = await handleResponse<{ success: boolean; token: string; user: User }>(res);
    if (result.token) {
      setStoredToken(result.token);
    }
    return result;
  },

  logout(): void {
    setStoredToken(null);
  },

  // MongoDB Atlas Database
  async getDatabaseStatus(): Promise<any> {
    const res = await secureFetch('/api/database/status');
    return handleResponse(res);
  },

  async testDatabaseConnection(uri: string): Promise<{ success: boolean; message: string; pingMs?: number; databaseName?: string }> {
    const res = await secureFetch('/api/database/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri }),
    });
    return handleResponse(res);
  },

  async connectDatabase(uri: string): Promise<{ success: boolean; message: string; details: any; syncResult?: any }> {
    const res = await secureFetch('/api/database/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri }),
    });
    return handleResponse(res);
  },

  async syncToAtlas(): Promise<{ success: boolean; message: string; syncedCounts: Record<string, number> }> {
    const res = await secureFetch('/api/database/sync-to-atlas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse(res);
  },

  // Users
  async getUsers(): Promise<User[]> {
    const res = await secureFetch('/api/users');
    return handleResponse(res);
  },

  async createUser(data: any): Promise<{ success: boolean; user: User }> {
    const res = await secureFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateUser(id: string, data: any): Promise<{ success: boolean }> {
    const res = await secureFetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  // Customers
  async getCustomers(params?: { search?: string; category?: string; status?: string }): Promise<Customer[]> {
    const url = new URL('/api/customers', window.location.origin);
    if (params?.search) url.searchParams.set('search', params.search);
    if (params?.category) url.searchParams.set('category', params.category);
    if (params?.status) url.searchParams.set('status', params.status);
    const res = await secureFetch(url.toString());
    return handleResponse(res);
  },

  async getCustomer(id: string): Promise<Customer> {
    const res = await secureFetch(`/api/customers/${id}`);
    return handleResponse(res);
  },

  async createCustomer(data: any): Promise<Customer> {
    const res = await secureFetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateCustomer(id: string, data: any): Promise<{ success: boolean }> {
    const res = await secureFetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  // Customer Ledger & Monthly Summary
  async getCustomerMonthlySummary(
    id: string,
    params: { month?: number; year?: number; startDate?: string; endDate?: string }
  ): Promise<CustomerMonthlySummary> {
    const url = new URL(`/api/customers/${id}/monthly-summary`, window.location.origin);
    if (params.month) url.searchParams.set('month', String(params.month));
    if (params.year) url.searchParams.set('year', String(params.year));
    if (params.startDate) url.searchParams.set('startDate', params.startDate);
    if (params.endDate) url.searchParams.set('endDate', params.endDate);
    const res = await secureFetch(url.toString());
    return handleResponse(res);
  },

  async getCustomerLedger(id: string, params?: { startDate?: string; endDate?: string }): Promise<any> {
    const url = new URL(`/api/customers/${id}/ledger`, window.location.origin);
    if (params?.startDate) url.searchParams.set('startDate', params.startDate);
    if (params?.endDate) url.searchParams.set('endDate', params.endDate);
    const res = await secureFetch(url.toString());
    return handleResponse(res);
  },

  // Products
  async getProducts(params?: { search?: string; category?: string; lowStock?: boolean }): Promise<Product[]> {
    const url = new URL('/api/products', window.location.origin);
    if (params?.search) url.searchParams.set('search', params.search);
    if (params?.category) url.searchParams.set('category', params.category);
    if (params?.lowStock) url.searchParams.set('lowStock', 'true');
    const res = await secureFetch(url.toString());
    return handleResponse(res);
  },

  async createProduct(data: any): Promise<{ success: boolean; id: string; sku: string }> {
    const res = await secureFetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateProduct(id: string, data: any): Promise<{ success: boolean }> {
    const res = await secureFetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async adjustStock(
    id: string,
    data: { adjustmentQuantity: number; reason: string; userRole?: string; createdByName?: string; createdById?: string }
  ): Promise<{ success: boolean; newStock: number }> {
    const res = await secureFetch(`/api/products/${id}/adjust-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async getProductMovements(id: string): Promise<any[]> {
    const res = await secureFetch(`/api/products/${id}/movements`);
    return handleResponse(res);
  },

  // Invoices & POS
  async getInvoices(params?: {
    search?: string;
    customerId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<Invoice[]> {
    const url = new URL('/api/invoices', window.location.origin);
    if (params?.search) url.searchParams.set('search', params.search);
    if (params?.customerId) url.searchParams.set('customerId', params.customerId);
    if (params?.status) url.searchParams.set('status', params.status);
    if (params?.startDate) url.searchParams.set('startDate', params.startDate);
    if (params?.endDate) url.searchParams.set('endDate', params.endDate);
    if (params?.limit) url.searchParams.set('limit', String(params.limit));
    if (params?.offset) url.searchParams.set('offset', String(params.offset));
    const res = await secureFetch(url.toString());
    return handleResponse(res);
  },

  async getInvoice(id: string): Promise<Invoice> {
    const res = await secureFetch(`/api/invoices/${id}`);
    return handleResponse(res);
  },

  async createInvoice(data: any): Promise<{
    success: boolean;
    invoiceId: string;
    invoiceNumber: string;
    grandTotal: number;
    paidAmount: number;
    balanceAmount: number;
    paymentStatus: string;
  }> {
    const res = await secureFetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async cancelInvoice(
    id: string,
    data: { reason: string; userRole?: string; cancelledByName?: string; cancelledById?: string }
  ): Promise<{ success: boolean; message: string }> {
    const res = await secureFetch(`/api/invoices/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  // Payments
  async getPayments(params?: { customerId?: string; invoiceId?: string; startDate?: string; endDate?: string }): Promise<Payment[]> {
    const url = new URL('/api/payments', window.location.origin);
    if (params?.customerId) url.searchParams.set('customerId', params.customerId);
    if (params?.invoiceId) url.searchParams.set('invoiceId', params.invoiceId);
    if (params?.startDate) url.searchParams.set('startDate', params.startDate);
    if (params?.endDate) url.searchParams.set('endDate', params.endDate);
    const res = await secureFetch(url.toString());
    return handleResponse(res);
  },

  async createPayment(data: any): Promise<{
    success: boolean;
    paymentId: string;
    receiptNumber: string;
    amount: number;
    newCustomerBalance: number;
  }> {
    const res = await secureFetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async voidPayment(
    id: string,
    data: { reason: string; userRole?: string; voidedByName?: string; voidedById?: string }
  ): Promise<{ success: boolean; message: string }> {
    const res = await secureFetch(`/api/payments/${id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  // Suppliers & Purchases
  async getSuppliers(): Promise<Supplier[]> {
    const res = await secureFetch('/api/suppliers');
    return handleResponse(res);
  },

  async createSupplier(data: any): Promise<{ id: string; name: string }> {
    const res = await secureFetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async getPurchases(): Promise<Purchase[]> {
    const res = await secureFetch('/api/purchases');
    return handleResponse(res);
  },

  async createPurchase(data: any): Promise<{ success: boolean; purchaseId: string; purchaseNumber: string }> {
    const res = await secureFetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  // Expenses
  async getExpenses(params?: { category?: string; startDate?: string; endDate?: string }): Promise<Expense[]> {
    const url = new URL('/api/expenses', window.location.origin);
    if (params?.category) url.searchParams.set('category', params.category);
    if (params?.startDate) url.searchParams.set('startDate', params.startDate);
    if (params?.endDate) url.searchParams.set('endDate', params.endDate);
    const res = await secureFetch(url.toString());
    return handleResponse(res);
  },

  async createExpense(data: any): Promise<{ success: boolean; id: string }> {
    const res = await secureFetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteExpense(
    id: string,
    data: { userRole?: string; deletedByName?: string; deletedById?: string }
  ): Promise<{ success: boolean }> {
    const res = await secureFetch(`/api/expenses/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  // Dashboard & Reports
  async getDashboardStats(params?: { filter?: string; startDate?: string; endDate?: string }): Promise<DashboardStats> {
    const url = new URL('/api/dashboard/stats', window.location.origin);
    if (params?.filter) url.searchParams.set('filter', params.filter);
    if (params?.startDate) url.searchParams.set('startDate', params.startDate);
    if (params?.endDate) url.searchParams.set('endDate', params.endDate);
    const res = await secureFetch(url.toString());
    return handleResponse(res);
  },

  async getReportSummary(params: { reportType: string; startDate?: string; endDate?: string }): Promise<any[]> {
    const url = new URL('/api/reports/summary', window.location.origin);
    url.searchParams.set('reportType', params.reportType);
    if (params.startDate) url.searchParams.set('startDate', params.startDate);
    if (params.endDate) url.searchParams.set('endDate', params.endDate);
    const res = await secureFetch(url.toString());
    return handleResponse(res);
  },

  // Settings & Backup
  async getSettings(): Promise<BusinessSettings> {
    const res = await secureFetch('/api/settings');
    return handleResponse(res);
  },

  async updateSettings(data: any): Promise<{ success: boolean }> {
    const res = await secureFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async exportBackup(): Promise<any> {
    const res = await secureFetch('/api/backup');
    return handleResponse(res);
  },

  async restoreBackup(
    backupData: any,
    metadata: { userRole?: string; adminName?: string; adminId?: string }
  ): Promise<{ success: boolean; message: string }> {
    const res = await secureFetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupData, ...metadata }),
    });
    return handleResponse(res);
  },

  async getAuditLogs(): Promise<any[]> {
    const res = await secureFetch('/api/audit-logs');
    return handleResponse(res);
  },
};
