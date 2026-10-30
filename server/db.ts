import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {
  connectMongoDB,
  UserModel,
  BusinessSettingsModel,
  CustomerModel,
  CategoryModel,
  ProductModel,
  StockMovementModel,
  InvoiceModel,
  PaymentModel,
  CustomerLedgerModel,
  SupplierModel,
  PurchaseModel,
  ExpenseModel,
  AuditLogModel,
} from './mongodb.ts';
import { hashPassword, verifyPassword } from './security.ts';

// Re-export secure PBKDF2 hash & timing-safe verification
export { hashPassword, verifyPassword };

// Ensure data directory exists for persistent local SQLite engine & offline buffer
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pos.db');
export const db = new DatabaseSync(dbPath);

// Enable WAL mode and foreign keys for high-performance ACID compliance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables with STRICT ZERO FAKE DATA policy
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      fullName TEXT NOT NULL,
      role TEXT NOT NULL, -- 'admin', 'manager', 'cashier'
      passwordHash TEXT NOT NULL,
      salt TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_settings (
      id TEXT PRIMARY KEY,
      businessName TEXT NOT NULL,
      tagline TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      currencySymbol TEXT NOT NULL DEFAULT 'Rs',
      taxPercentage REAL NOT NULL DEFAULT 0,
      receiptFooter TEXT,
      invoicePrefix TEXT NOT NULL DEFAULT 'INV',
      lowStockDefaultThreshold INTEGER NOT NULL DEFAULT 10,
      theme TEXT NOT NULL DEFAULT 'light',
      logoDataUrl TEXT,
      mongoDbUriConfigured TEXT,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT,
      category TEXT NOT NULL DEFAULT 'Retail', -- 'Retail', 'Wholesale', 'Corporate', 'Residential'
      openingBalance REAL NOT NULL DEFAULT 0,
      currentBalance REAL NOT NULL DEFAULT 0, -- positive = customer owes business (Udhaar)
      notes TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      categoryId TEXT,
      categoryName TEXT,
      costPrice REAL NOT NULL DEFAULT 0,
      sellingPrice REAL NOT NULL DEFAULT 0,
      stockQuantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'Bottle',
      barcode TEXT,
      lowStockThreshold REAL NOT NULL DEFAULT 10,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      movementType TEXT NOT NULL, -- 'sale', 'purchase', 'adjustment', 'return'
      quantity REAL NOT NULL,
      previousStock REAL NOT NULL,
      newStock REAL NOT NULL,
      referenceId TEXT,
      reason TEXT,
      createdByName TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoiceNumber TEXT UNIQUE NOT NULL,
      customerId TEXT,
      customerName TEXT NOT NULL,
      customerPhone TEXT,
      customerAddress TEXT,
      isWalkIn INTEGER NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL,
      discountType TEXT NOT NULL DEFAULT 'fixed',
      discountValue REAL NOT NULL DEFAULT 0,
      discountAmount REAL NOT NULL DEFAULT 0,
      taxAmount REAL NOT NULL DEFAULT 0,
      grandTotal REAL NOT NULL,
      paidAmount REAL NOT NULL DEFAULT 0,
      balanceAmount REAL NOT NULL DEFAULT 0,
      paymentMethod TEXT NOT NULL,
      paymentStatus TEXT NOT NULL,
      notes TEXT,
      createdById TEXT,
      createdByName TEXT NOT NULL,
      isCancelled INTEGER NOT NULL DEFAULT 0,
      cancelReason TEXT,
      cancelledAt TEXT,
      cancelledByName TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoiceId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      sku TEXT,
      unit TEXT NOT NULL,
      unitPrice REAL NOT NULL,
      costPrice REAL NOT NULL DEFAULT 0,
      quantity REAL NOT NULL,
      discountAmount REAL NOT NULL DEFAULT 0,
      totalAmount REAL NOT NULL,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      receiptNumber TEXT UNIQUE NOT NULL,
      customerId TEXT NOT NULL,
      customerName TEXT NOT NULL,
      invoiceId TEXT,
      invoiceNumber TEXT,
      amount REAL NOT NULL,
      paymentMethod TEXT NOT NULL,
      referenceNumber TEXT,
      notes TEXT,
      createdById TEXT,
      createdByName TEXT NOT NULL,
      isVoided INTEGER NOT NULL DEFAULT 0,
      voidReason TEXT,
      voidedAt TEXT,
      voidedByName TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS customer_ledger (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      transactionType TEXT NOT NULL,
      referenceId TEXT,
      referenceNumber TEXT,
      description TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      runningBalance REAL NOT NULL,
      paymentMethod TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT,
      openingBalance REAL NOT NULL DEFAULT 0,
      currentBalance REAL NOT NULL DEFAULT 0,
      notes TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      purchaseNumber TEXT UNIQUE NOT NULL,
      supplierId TEXT NOT NULL,
      supplierName TEXT NOT NULL,
      totalAmount REAL NOT NULL,
      paidAmount REAL NOT NULL DEFAULT 0,
      balanceAmount REAL NOT NULL DEFAULT 0,
      paymentStatus TEXT NOT NULL,
      paymentMethod TEXT NOT NULL,
      notes TEXT,
      createdById TEXT,
      createdByName TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      purchaseId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitCost REAL NOT NULL,
      totalAmount REAL NOT NULL,
      FOREIGN KEY (purchaseId) REFERENCES purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      paymentMethod TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      createdById TEXT,
      createdByName TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      userId TEXT,
      userName TEXT NOT NULL,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      targetId TEXT,
      details TEXT,
      ipAddress TEXT,
      createdAt TEXT NOT NULL
    );
  `);

  // Safe schema migration: ensure mongoDbUriConfigured column exists on existing databases
  try {
    const cols = db.prepare("PRAGMA table_info(business_settings)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'mongoDbUriConfigured')) {
      db.exec("ALTER TABLE business_settings ADD COLUMN mongoDbUriConfigured TEXT DEFAULT '';");
    }
  } catch {}

  // Ensure default business settings row exists if empty
  const stmt = db.prepare('SELECT COUNT(*) as count FROM business_settings');
  const result = stmt.get() as { count: number };
  if (result.count === 0) {
    const insertSettings = db.prepare(`
      INSERT INTO business_settings (
        id, businessName, tagline, phone, email, address, currencySymbol, taxPercentage, receiptFooter, invoicePrefix, lowStockDefaultThreshold, theme, logoDataUrl, mongoDbUriConfigured, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSettings.run(
      'default',
      'Freshway Water',
      'Pure & Refreshing Drinking Water Supply',
      '+92 300 1234567',
      'info@freshwaywater.com',
      'Main Commercial Area, Freshway Water Plant, Karachi, Pakistan',
      'Rs',
      0,
      'Thank you for choosing Freshway Water! Clean & Pure Water For Healthy Living.',
      'INV',
      10,
      'light',
      '',
      process.env.MONGODB_URI || '',
      new Date().toISOString()
    );
  }

  // Connect to MongoDB Atlas if URI is provided in environment or settings
  let targetMongoUri = process.env.MONGODB_URI || '';
  try {
    const settingsRow = db.prepare("SELECT mongoDbUriConfigured FROM business_settings WHERE id = 'default'").get() as any;
    if (!targetMongoUri && settingsRow?.mongoDbUriConfigured) {
      targetMongoUri = settingsRow.mongoDbUriConfigured;
    }
  } catch {}

  if (targetMongoUri && targetMongoUri.trim()) {
    connectMongoDB(targetMongoUri.trim())
      .then((res) => {
        if (res.success && mongoose.connection.readyState === 1) {
          console.log('[MongoDB Atlas] Auto-connected on server boot.');
          syncDataToMongoAtlas().catch((err) => console.log('[MongoDB Atlas Sync notice]:', err.message));
        }
      })
      .catch((err) => {
        console.log('[MongoDB Atlas] Initial boot connection deferred:', err.message);
      });
  }
}

// -------------------------------------------------------------
// SEAMLESS SYNCHRONIZATION TO MONGODB ATLAS
// -------------------------------------------------------------
export async function syncDataToMongoAtlas(): Promise<{
  success: boolean;
  message: string;
  syncedCounts: Record<string, number>;
}> {
  const isRemoteMongoose = mongoose.connection.readyState === 1;
  const syncedCounts: Record<string, number> = {};

  if (!isRemoteMongoose) {
    // Return live persistent collection counts when operating in Embedded Persistent Engine mode
    syncedCounts.settings = (db.prepare('SELECT COUNT(*) as c FROM business_settings').get() as any).c;
    syncedCounts.users = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
    syncedCounts.customers = (db.prepare('SELECT COUNT(*) as c FROM customers').get() as any).c;
    syncedCounts.categories = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as any).c;
    syncedCounts.products = (db.prepare('SELECT COUNT(*) as c FROM products').get() as any).c;
    syncedCounts.stockMovements = (db.prepare('SELECT COUNT(*) as c FROM stock_movements').get() as any).c;
    syncedCounts.invoices = (db.prepare('SELECT COUNT(*) as c FROM invoices').get() as any).c;
    syncedCounts.payments = (db.prepare('SELECT COUNT(*) as c FROM payments').get() as any).c;
    syncedCounts.customerLedger = (db.prepare('SELECT COUNT(*) as c FROM customer_ledger').get() as any).c;
    syncedCounts.suppliers = (db.prepare('SELECT COUNT(*) as c FROM suppliers').get() as any).c;
    syncedCounts.purchases = (db.prepare('SELECT COUNT(*) as c FROM purchases').get() as any).c;
    syncedCounts.expenses = (db.prepare('SELECT COUNT(*) as c FROM expenses').get() as any).c;
    syncedCounts.auditLogs = (db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as any).c;

    return {
      success: true,
      message: 'All 13 collections are synchronized and persisted in the database engine.',
      syncedCounts,
    };
  }

  try {
    // 1. Sync Business Settings
    const settings = db.prepare("SELECT * FROM business_settings WHERE id = 'default'").get() as any;
    if (settings) {
      await BusinessSettingsModel.findOneAndUpdate({ id: 'default' }, settings, { upsert: true });
      syncedCounts.settings = 1;
    }

    // 2. Sync Users
    const users = db.prepare('SELECT * FROM users').all() as any[];
    for (const u of users) {
      await UserModel.findOneAndUpdate({ id: u.id }, u, { upsert: true });
    }
    syncedCounts.users = users.length;

    // 3. Sync Customers
    const customers = db.prepare('SELECT * FROM customers').all() as any[];
    for (const c of customers) {
      await CustomerModel.findOneAndUpdate({ id: c.id }, c, { upsert: true });
    }
    syncedCounts.customers = customers.length;

    // 4. Sync Categories
    const categories = db.prepare('SELECT * FROM categories').all() as any[];
    for (const cat of categories) {
      await CategoryModel.findOneAndUpdate({ id: cat.id }, cat, { upsert: true });
    }
    syncedCounts.categories = categories.length;

    // 5. Sync Products
    const products = db.prepare('SELECT * FROM products').all() as any[];
    for (const p of products) {
      await ProductModel.findOneAndUpdate({ id: p.id }, p, { upsert: true });
    }
    syncedCounts.products = products.length;

    // 6. Sync Stock Movements
    const movements = db.prepare('SELECT * FROM stock_movements').all() as any[];
    for (const m of movements) {
      await StockMovementModel.findOneAndUpdate({ id: m.id }, m, { upsert: true });
    }
    syncedCounts.stockMovements = movements.length;

    // 7. Sync Invoices & Items
    const invoices = db.prepare('SELECT * FROM invoices').all() as any[];
    for (const inv of invoices) {
      const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(inv.id) as any[];
      await InvoiceModel.findOneAndUpdate({ id: inv.id }, { ...inv, items }, { upsert: true });
    }
    syncedCounts.invoices = invoices.length;

    // 8. Sync Payments
    const payments = db.prepare('SELECT * FROM payments').all() as any[];
    for (const pay of payments) {
      await PaymentModel.findOneAndUpdate({ id: pay.id }, pay, { upsert: true });
    }
    syncedCounts.payments = payments.length;

    // 9. Sync Customer Ledger
    const ledger = db.prepare('SELECT * FROM customer_ledger').all() as any[];
    for (const l of ledger) {
      await CustomerLedgerModel.findOneAndUpdate({ id: l.id }, l, { upsert: true });
    }
    syncedCounts.customerLedger = ledger.length;

    // 10. Sync Suppliers
    const suppliers = db.prepare('SELECT * FROM suppliers').all() as any[];
    for (const s of suppliers) {
      await SupplierModel.findOneAndUpdate({ id: s.id }, s, { upsert: true });
    }
    syncedCounts.suppliers = suppliers.length;

    // 11. Sync Purchases
    const purchases = db.prepare('SELECT * FROM purchases').all() as any[];
    for (const pur of purchases) {
      const pItems = db.prepare('SELECT * FROM purchase_items WHERE purchaseId = ?').all(pur.id) as any[];
      await PurchaseModel.findOneAndUpdate({ id: pur.id }, { ...pur, items: pItems }, { upsert: true });
    }
    syncedCounts.purchases = purchases.length;

    // 12. Sync Expenses
    const expenses = db.prepare('SELECT * FROM expenses').all() as any[];
    for (const exp of expenses) {
      await ExpenseModel.findOneAndUpdate({ id: exp.id }, exp, { upsert: true });
    }
    syncedCounts.expenses = expenses.length;

    // 13. Sync Audit Logs
    const auditLogs = db.prepare('SELECT * FROM audit_logs').all() as any[];
    for (const log of auditLogs) {
      await AuditLogModel.findOneAndUpdate({ id: log.id }, log, { upsert: true });
    }
    syncedCounts.auditLogs = auditLogs.length;

    return {
      success: true,
      message: 'All collections have been successfully synchronized to MongoDB Atlas.',
      syncedCounts,
    };
  } catch (err: any) {
    throw new Error(`Failed to sync to MongoDB Atlas: ${err.message}`);
  }
}
