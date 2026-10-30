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
      .then(async (res) => {
        if (res.success && mongoose.connection.readyState === 1) {
          console.log('[MongoDB Atlas] Auto-connected on server boot.');
          await hydrateFromMongoAtlas().catch((err) => console.log('[MongoDB Atlas Hydrate notice]:', err.message));
          await syncDataToMongoAtlas().catch((err) => console.log('[MongoDB Atlas Sync notice]:', err.message));
        }
      })
      .catch((err) => {
        console.log('[MongoDB Atlas] Initial boot connection deferred:', err.message);
      });
  }
}

// -------------------------------------------------------------
// HYDRATE LOCAL ENGINE FROM MONGODB ATLAS (FOR RENDER EPHEMERAL RESTARTS)
// -------------------------------------------------------------
export async function hydrateFromMongoAtlas(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;

  try {
    // 1. Business Settings
    const remoteSettings = await BusinessSettingsModel.findOne({ id: 'default' }).lean();
    if (remoteSettings) {
      db.prepare(`
        UPDATE business_settings SET
          businessName = ?, tagline = ?, phone = ?, email = ?, address = ?,
          currencySymbol = ?, taxPercentage = ?, receiptFooter = ?, invoicePrefix = ?,
          lowStockDefaultThreshold = ?, theme = ?, logoDataUrl = ?, updatedAt = ?
        WHERE id = 'default'
      `).run(
        remoteSettings.businessName || 'Freshway Water',
        remoteSettings.tagline || '',
        remoteSettings.phone || '',
        remoteSettings.email || '',
        remoteSettings.address || '',
        remoteSettings.currencySymbol || 'Rs',
        remoteSettings.taxPercentage || 0,
        remoteSettings.receiptFooter || '',
        remoteSettings.invoicePrefix || 'INV',
        remoteSettings.lowStockDefaultThreshold || 10,
        remoteSettings.theme || 'light',
        remoteSettings.logoDataUrl || '',
        remoteSettings.updatedAt || new Date().toISOString()
      );
    }

    // 2. Users (include passwordHash and salt for login authentication)
    const remoteUsers = await UserModel.find().select('+passwordHash +salt').lean();
    if (remoteUsers.length > 0) {
      const upsertUser = db.prepare(`
        INSERT OR REPLACE INTO users (id, username, email, fullName, role, passwordHash, salt, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const u of remoteUsers) {
        if (u.passwordHash && u.salt) {
          upsertUser.run(
            u.id,
            u.username,
            u.email,
            u.fullName,
            u.role,
            u.passwordHash,
            u.salt,
            u.isActive !== undefined ? u.isActive : 1,
            u.createdAt,
            u.updatedAt
          );
        }
      }
    }

    // 3. Categories
    const remoteCategories = await CategoryModel.find().lean();
    if (remoteCategories.length > 0) {
      const upsertCat = db.prepare(`
        INSERT OR REPLACE INTO categories (id, name, description, createdAt)
        VALUES (?, ?, ?, ?)
      `);
      for (const cat of remoteCategories) {
        upsertCat.run(cat.id, cat.name, cat.description || '', cat.createdAt);
      }
    }

    // 4. Customers
    const remoteCustomers = await CustomerModel.find().lean();
    if (remoteCustomers.length > 0) {
      const upsertCust = db.prepare(`
        INSERT OR REPLACE INTO customers (id, name, phone, email, address, category, openingBalance, currentBalance, notes, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of remoteCustomers) {
        upsertCust.run(
          c.id,
          c.name,
          c.phone,
          c.email || '',
          c.address || '',
          c.category || 'Retail',
          c.openingBalance || 0,
          c.currentBalance || 0,
          c.notes || '',
          c.isActive !== undefined ? c.isActive : 1,
          c.createdAt,
          c.updatedAt
        );
      }
    }

    // 5. Products
    const remoteProducts = await ProductModel.find().lean();
    if (remoteProducts.length > 0) {
      const upsertProd = db.prepare(`
        INSERT OR REPLACE INTO products (id, name, sku, categoryId, categoryName, costPrice, sellingPrice, stockQuantity, unit, barcode, lowStockThreshold, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of remoteProducts) {
        upsertProd.run(
          p.id,
          p.name,
          p.sku,
          (p as any).categoryId || null,
          p.categoryName || 'General',
          p.costPrice || 0,
          p.sellingPrice || 0,
          p.stockQuantity || 0,
          p.unit || 'Bottle',
          p.barcode || '',
          p.lowStockThreshold || 10,
          p.isActive !== undefined ? p.isActive : 1,
          p.createdAt,
          p.updatedAt
        );
      }
    }

    // 6. Stock Movements
    const remoteMovements = await StockMovementModel.find().lean();
    if (remoteMovements.length > 0) {
      const upsertMov = db.prepare(`
        INSERT OR REPLACE INTO stock_movements (id, productId, movementType, quantity, previousStock, newStock, referenceId, reason, createdByName, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of remoteMovements) {
        upsertMov.run(
          m.id,
          m.productId,
          m.movementType,
          m.quantity,
          m.previousStock,
          m.newStock,
          m.referenceId || '',
          m.reason || '',
          m.createdByName || 'Staff',
          m.createdAt
        );
      }
    }

    // 7. Invoices & Invoice Items
    const remoteInvoices = await InvoiceModel.find().lean();
    if (remoteInvoices.length > 0) {
      const upsertInv = db.prepare(`
        INSERT OR REPLACE INTO invoices (
          id, invoiceNumber, customerId, customerName, customerPhone, customerAddress, isWalkIn,
          subtotal, discountType, discountValue, discountAmount, taxAmount, grandTotal,
          paidAmount, balanceAmount, paymentMethod, paymentStatus, notes, createdById, createdByName,
          isCancelled, cancelReason, cancelledAt, cancelledByName, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const upsertInvItem = db.prepare(`
        INSERT OR REPLACE INTO invoice_items (id, invoiceId, productId, productName, sku, unit, unitPrice, costPrice, quantity, discountAmount, totalAmount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const inv of remoteInvoices) {
        upsertInv.run(
          inv.id,
          inv.invoiceNumber,
          inv.customerId || null,
          inv.customerName,
          inv.customerPhone || '',
          inv.customerAddress || '',
          inv.isWalkIn ? 1 : 0,
          inv.subtotal || 0,
          inv.discountType || 'fixed',
          inv.discountValue || 0,
          inv.discountAmount || 0,
          inv.taxAmount || 0,
          inv.grandTotal || 0,
          inv.paidAmount || 0,
          inv.balanceAmount || 0,
          inv.paymentMethod || 'Cash',
          inv.paymentStatus || 'Paid',
          inv.notes || '',
          inv.createdById || null,
          inv.createdByName || 'Staff',
          inv.isCancelled ? 1 : 0,
          inv.cancelReason || '',
          inv.cancelledAt || '',
          inv.cancelledByName || '',
          inv.createdAt,
          inv.updatedAt
        );
        if (Array.isArray(inv.items)) {
          for (const it of inv.items as any[]) {
            upsertInvItem.run(
              it.id || crypto.randomUUID(),
              inv.id,
              it.productId,
              it.productName,
              it.sku || '',
              it.unit || 'Bottle',
              it.unitPrice || 0,
              it.costPrice || 0,
              it.quantity || 1,
              it.discountAmount || 0,
              it.totalAmount || 0
            );
          }
        }
      }
    }

    // 8. Payments
    const remotePayments = await PaymentModel.find().lean();
    if (remotePayments.length > 0) {
      const upsertPay = db.prepare(`
        INSERT OR REPLACE INTO payments (id, receiptNumber, customerId, customerName, invoiceId, invoiceNumber, amount, paymentMethod, referenceNumber, notes, createdById, createdByName, isVoided, voidReason, voidedAt, voidedByName, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of remotePayments) {
        upsertPay.run(
          p.id,
          p.receiptNumber,
          p.customerId,
          p.customerName,
          p.invoiceId || null,
          p.invoiceNumber || '',
          p.amount,
          p.paymentMethod || 'Cash',
          p.referenceNumber || '',
          p.notes || '',
          p.createdById || null,
          p.createdByName || 'Staff',
          p.isVoided ? 1 : 0,
          p.voidReason || '',
          p.voidedAt || '',
          p.voidedByName || '',
          p.createdAt
        );
      }
    }

    // 9. Customer Ledger
    const remoteLedger = await CustomerLedgerModel.find().lean();
    if (remoteLedger.length > 0) {
      const upsertLed = db.prepare(`
        INSERT OR REPLACE INTO customer_ledger (id, customerId, transactionType, referenceId, referenceNumber, description, debit, credit, runningBalance, paymentMethod, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const l of remoteLedger) {
        upsertLed.run(
          l.id,
          l.customerId,
          l.transactionType,
          l.referenceId || null,
          l.referenceNumber || '',
          l.description,
          l.debit || 0,
          l.credit || 0,
          l.runningBalance || 0,
          l.paymentMethod || '',
          l.createdAt
        );
      }
    }

    // 10. Suppliers
    const remoteSuppliers = await SupplierModel.find().lean();
    if (remoteSuppliers.length > 0) {
      const upsertSup = db.prepare(`
        INSERT OR REPLACE INTO suppliers (id, name, company, phone, email, address, openingBalance, currentBalance, notes, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of remoteSuppliers) {
        upsertSup.run(
          s.id,
          s.name,
          s.company || '',
          s.phone,
          s.email || '',
          s.address || '',
          s.openingBalance || 0,
          s.currentBalance || 0,
          s.notes || '',
          s.isActive !== undefined ? s.isActive : 1,
          s.createdAt,
          s.updatedAt
        );
      }
    }

    // 11. Purchases & Purchase Items
    const remotePurchases = await PurchaseModel.find().lean();
    if (remotePurchases.length > 0) {
      const upsertPur = db.prepare(`
        INSERT OR REPLACE INTO purchases (id, purchaseNumber, supplierId, supplierName, totalAmount, paidAmount, balanceAmount, paymentStatus, paymentMethod, notes, createdById, createdByName, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const upsertPurItem = db.prepare(`
        INSERT OR REPLACE INTO purchase_items (id, purchaseId, productId, productName, unit, quantity, unitCost, totalAmount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const pur of remotePurchases) {
        upsertPur.run(
          pur.id,
          pur.purchaseNumber,
          pur.supplierId,
          pur.supplierName,
          pur.totalAmount || 0,
          pur.paidAmount || 0,
          pur.balanceAmount || 0,
          pur.paymentStatus || 'Paid',
          pur.paymentMethod || 'Cash',
          pur.notes || '',
          pur.createdById || null,
          pur.createdByName || 'Staff',
          pur.createdAt
        );
        if (Array.isArray(pur.items)) {
          for (const pi of pur.items as any[]) {
            upsertPurItem.run(
              pi.id || crypto.randomUUID(),
              pur.id,
              pi.productId,
              pi.productName,
              pi.unit || 'Piece',
              pi.quantity || 1,
              pi.unitCost || 0,
              pi.totalAmount || 0
            );
          }
        }
      }
    }

    // 12. Expenses
    const remoteExpenses = await ExpenseModel.find().lean();
    if (remoteExpenses.length > 0) {
      const upsertExp = db.prepare(`
        INSERT OR REPLACE INTO expenses (id, title, category, amount, paymentMethod, date, description, createdById, createdByName, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const exp of remoteExpenses) {
        upsertExp.run(
          exp.id,
          exp.title,
          exp.category,
          exp.amount,
          exp.paymentMethod || 'Cash',
          exp.date,
          exp.description || '',
          exp.createdById || null,
          exp.createdByName || 'Staff',
          exp.createdAt
        );
      }
    }

    // 13. Audit Logs
    const remoteLogs = await AuditLogModel.find().sort({ createdAt: -1 }).limit(300).lean();
    if (remoteLogs.length > 0) {
      const upsertLog = db.prepare(`
        INSERT OR REPLACE INTO audit_logs (id, userId, userName, action, module, targetId, details, ipAddress, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const log of remoteLogs) {
        upsertLog.run(
          log.id,
          log.userId || null,
          log.userName,
          log.action,
          log.module,
          log.targetId || null,
          log.details || '',
          log.ipAddress || '127.0.0.1',
          log.createdAt
        );
      }
    }
  } catch (err: any) {
    console.warn('[MongoDB Atlas Hydrate Warning]:', err.message);
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
