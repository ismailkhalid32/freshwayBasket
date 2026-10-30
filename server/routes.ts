import { Router } from 'express';
import mongoose from 'mongoose';
import { db, hashPassword, verifyPassword, syncDataToMongoAtlas } from './db.ts';
import {
  generateToken,
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from './security.ts';
import {
  connectMongoDB,
  getMongoDBStatus,
  testMongoDBConnection,
  pingMongoDB,
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
import crypto from 'node:crypto';

export const apiRouter = Router();

// Helper to log audit events into both SQLite & MongoDB Atlas
export function logAudit(
  userId: string | null,
  userName: string,
  action: string,
  module: string,
  targetId: string | null,
  details: string,
  ipAddress?: string
) {
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();
  const ip = ipAddress || '127.0.0.1';

  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, userId, userName, action, module, targetId, details, ipAddress, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(auditId, userId || null, userName || 'System', action, module, targetId || null, details, ip, now);
  } catch (e) {
    console.error('Audit log SQLite failed:', e);
  }

  // Mirror to MongoDB Atlas if connected
  if (mongoose.connection.readyState === 1) {
    AuditLogModel.create({
      id: auditId,
      userId: userId || undefined,
      userName: userName || 'System',
      action,
      module,
      targetId: targetId || undefined,
      details,
      ipAddress: ip,
      createdAt: now,
    }).catch((err) => console.error('MongoDB Atlas AuditLog error:', err.message));
  }
}

// -------------------------------------------------------------
// 1. AUTH & USER MANAGEMENT (WITH BRUTE-FORCE RATE LIMITING & PBKDF2)
// -------------------------------------------------------------

// Check if first-time admin setup is needed
apiRouter.get('/auth/status', (req, res) => {
  try {
    const countRow = db.prepare('SELECT COUNT(*) as userCount FROM users').get() as { userCount: number };
    const settings = db.prepare("SELECT * FROM business_settings WHERE id = 'default'").get();
    const mongoStatus = getMongoDBStatus();

    res.json({
      needsSetup: countRow.userCount === 0,
      userCount: countRow.userCount,
      settings: settings || null,
      database: {
        mongo: mongoStatus,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// First-time Super Admin Setup
apiRouter.post('/auth/setup', async (req, res) => {
  try {
    const countRow = db.prepare('SELECT COUNT(*) as userCount FROM users').get() as { userCount: number };
    if (countRow.userCount > 0) {
      return res.status(400).json({ error: 'System is already configured with an administrator account. Please log in.' });
    }

    const { username, email, fullName, password, businessName, phone, address, mongoDbUri } = req.body;
    if (!username || !email || !fullName || !password) {
      return res.status(400).json({ error: 'Full name, username, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const { hash, salt } = hashPassword(password);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const cleanUsername = String(username).trim().toLowerCase();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanFullName = String(fullName).trim();

    db.exec('BEGIN TRANSACTION;');
    try {
      const insertUser = db.prepare(`
        INSERT INTO users (id, username, email, fullName, role, passwordHash, salt, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, 'admin', ?, ?, 1, ?, ?)
      `);
      insertUser.run(userId, cleanUsername, cleanEmail, cleanFullName, hash, salt, now, now);

      if (businessName || mongoDbUri) {
        const updateSettings = db.prepare(`
          UPDATE business_settings SET businessName = ?, phone = ?, address = ?, mongoDbUriConfigured = ?, updatedAt = ? WHERE id = 'default'
        `);
        updateSettings.run(businessName || 'Freshway Water', phone || '', address || '', mongoDbUri || '', now);
      }

      db.exec('COMMIT;');

      const token = generateToken({ id: userId, username: cleanUsername, role: 'admin' });

      // If user supplied MongoDB Atlas URI during setup, connect now
      if (mongoDbUri && String(mongoDbUri).trim()) {
        connectMongoDB(String(mongoDbUri).trim())
          .then(() => syncDataToMongoAtlas())
          .catch((err) => console.error('[Atlas Init Setup Err]:', err.message));
      } else if (mongoose.connection.readyState === 1) {
        UserModel.create({
          id: userId,
          username: cleanUsername,
          email: cleanEmail,
          fullName: cleanFullName,
          role: 'admin',
          passwordHash: hash,
          salt,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        }).catch((err) => console.error('Atlas User Create Err:', err.message));
      }

      logAudit(userId, cleanFullName, 'SETUP_ADMIN', 'AUTH', userId, `Super admin created: ${cleanUsername}`, req.ip);

      res.status(201).json({
        success: true,
        token,
        user: {
          id: userId,
          username: cleanUsername,
          email: cleanEmail,
          fullName: cleanFullName,
          role: 'admin',
        },
      });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Login with Rate Limiting & PBKDF2 Verification
apiRouter.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Please enter both username/email and password.' });
    }

    const cleanInput = String(username).trim().toLowerCase();
    const rateLimitKey = `${req.ip}_${cleanInput}`;

    // Rate Limiting Check
    const rateCheck = checkRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      logAudit(null, cleanInput, 'LOGIN_BLOCKED_RATE_LIMIT', 'AUTH', null, `Too many failed login attempts for ${cleanInput}`, req.ip);
      return res.status(429).json({
        error: `Too many failed login attempts. Please wait ${rateCheck.waitSeconds} seconds before trying again.`,
      });
    }

    const user = db.prepare(`
      SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?
    `).get(cleanInput, cleanInput) as any;

    if (!user) {
      recordFailedAttempt(rateLimitKey);
      logAudit(null, cleanInput, 'LOGIN_FAILED', 'AUTH', null, `Failed login attempt for non-existent user: ${cleanInput}`, req.ip);
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been deactivated. Please contact your system administrator.' });
    }

    const isValid = verifyPassword(String(password), user.passwordHash, user.salt);
    if (!isValid) {
      recordFailedAttempt(rateLimitKey);
      logAudit(user.id, user.username, 'LOGIN_FAILED', 'AUTH', user.id, `Invalid password entered for user ${user.username}`, req.ip);
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    // Login successful
    recordSuccessfulAttempt(rateLimitKey);
    const token = generateToken({ id: user.id, username: user.username, role: user.role });

    logAudit(user.id, user.fullName, 'LOGIN_SUCCESS', 'AUTH', user.id, `User logged in successfully`, req.ip);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Verify Current Session Token (/api/auth/me)
apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userPayload?.userId || '';
    const user = db.prepare(`
      SELECT id, username, email, fullName, role, isActive FROM users WHERE id = ?
    `).get(userId) as any;

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Account no longer active or not found.' });
    }

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users (Admin only)
apiRouter.get('/users', requireRole(['admin']), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, email, fullName, role, isActive, createdAt, updatedAt FROM users ORDER BY createdAt ASC
    `).all();
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user (Admin only)
apiRouter.post('/users', requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { username, email, fullName, password, role, adminName, adminId } = req.body;
    if (!username || !email || !fullName || !password || !role) {
      return res.status(400).json({ error: 'Full name, username, email, role, and password are required.' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanFullName = String(fullName).trim();

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existing = db.prepare(`
      SELECT id FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?
    `).get(cleanUsername, cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'A user with this username or email already exists.' });
    }

    const { hash, salt } = hashPassword(password);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const insertUser = db.prepare(`
      INSERT INTO users (id, username, email, fullName, role, passwordHash, salt, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    insertUser.run(userId, cleanUsername, cleanEmail, cleanFullName, role, hash, salt, now, now);

    // Mirror to MongoDB Atlas if connected
    if (mongoose.connection.readyState === 1) {
      UserModel.create({
        id: userId,
        username: cleanUsername,
        email: cleanEmail,
        fullName: cleanFullName,
        role,
        passwordHash: hash,
        salt,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      }).catch((err) => console.error('Atlas User Create Err:', err.message));
    }

    const callerName = req.userPayload?.username || adminName || 'Admin';
    const callerId = req.userPayload?.userId || adminId || null;
    logAudit(callerId, callerName, 'CREATE_USER', 'USERS', userId, `Created user ${cleanUsername} with role ${role}`, req.ip);

    res.status(201).json({
      success: true,
      user: { id: userId, username: cleanUsername, email: cleanEmail, fullName: cleanFullName, role, isActive: 1 },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update user / status / password (Admin only)
apiRouter.put('/users/:id', requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { fullName, role, isActive, password, adminName, adminId } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const now = new Date().toISOString();
    let hash = user.passwordHash;
    let salt = user.salt;

    if (password && String(password).trim().length >= 6) {
      const passInfo = hashPassword(String(password).trim());
      hash = passInfo.hash;
      salt = passInfo.salt;
    }

    const targetFullName = fullName !== undefined ? String(fullName).trim() : user.fullName;
    const targetRole = role !== undefined ? role : user.role;
    const targetActive = isActive !== undefined ? Number(isActive) : user.isActive;

    db.prepare(`
      UPDATE users SET fullName = ?, role = ?, isActive = ?, passwordHash = ?, salt = ?, updatedAt = ? WHERE id = ?
    `).run(targetFullName, targetRole, targetActive, hash, salt, now, id);

    // Mirror update to Atlas
    if (mongoose.connection.readyState === 1) {
      UserModel.findOneAndUpdate(
        { id },
        { fullName: targetFullName, role: targetRole, isActive: targetActive, passwordHash: hash, salt, updatedAt: now }
      ).catch((err) => console.error('Atlas User Update Err:', err.message));
    }

    const callerName = req.userPayload?.username || adminName || 'Admin';
    const callerId = req.userPayload?.userId || adminId || null;
    logAudit(callerId, callerName, 'UPDATE_USER', 'USERS', id, `Updated account settings for user ${user.username}`, req.ip);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 2. MONGODB ATLAS DATABASE MANAGEMENT & DIAGNOSTICS
// -------------------------------------------------------------

// Get real-time MongoDB Atlas status and collection statistics
apiRouter.get('/database/status', requireAuth, async (req, res) => {
  try {
    const status = getMongoDBStatus();

    const localUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
    const localCustomers = (db.prepare('SELECT COUNT(*) as c FROM customers').get() as any).c;
    const localProducts = (db.prepare('SELECT COUNT(*) as c FROM products').get() as any).c;
    const localInvoices = (db.prepare('SELECT COUNT(*) as c FROM invoices').get() as any).c;
    const localPayments = (db.prepare('SELECT COUNT(*) as c FROM payments').get() as any).c;

    let atlasCounts: Record<string, number> = {
      users: localUsers,
      customers: localCustomers,
      products: localProducts,
      invoices: localInvoices,
      payments: localPayments,
    };

    if (mongoose.connection.readyState === 1) {
      try {
        const [uCount, cCount, pCount, iCount, payCount] = await Promise.all([
          UserModel.countDocuments(),
          CustomerModel.countDocuments(),
          ProductModel.countDocuments(),
          InvoiceModel.countDocuments(),
          PaymentModel.countDocuments(),
        ]);
        atlasCounts = {
          users: uCount,
          customers: cCount,
          products: pCount,
          invoices: iCount,
          payments: payCount,
        };
      } catch (e: any) {
        console.log('Count fetch notice:', e.message);
      }
    }

    res.json({
      ...status,
      atlasCounts,
      localCounts: {
        users: localUsers,
        customers: localCustomers,
        products: localProducts,
        invoices: localInvoices,
        payments: localPayments,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test connection to any MongoDB Atlas URI
apiRouter.post('/database/test', async (req, res) => {
  try {
    const { uri } = req.body;
    if (!uri || !String(uri).trim()) {
      return res.status(400).json({ error: 'Please provide a MongoDB connection URI to test.' });
    }

    const result = await testMongoDBConnection(String(uri).trim());
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Connect and save MongoDB Atlas URI
apiRouter.post('/database/connect', requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { uri } = req.body;
    if (!uri || !String(uri).trim()) {
      return res.status(400).json({ error: 'MongoDB URI is required.' });
    }

    const cleanUri = String(uri).trim();
    const connectResult = await connectMongoDB(cleanUri);

    if (!connectResult.success) {
      return res.status(400).json({ error: connectResult.message });
    }

    // Persist configured URI in business settings
    const now = new Date().toISOString();
    db.prepare("UPDATE business_settings SET mongoDbUriConfigured = ?, updatedAt = ? WHERE id = 'default'").run(cleanUri, now);

    // Sync all existing data to the newly connected Atlas cluster
    let syncResult = null;
    try {
      syncResult = await syncDataToMongoAtlas();
    } catch (syncErr: any) {
      console.warn('Sync notice:', syncErr.message);
    }

    const callerName = req.userPayload?.username || 'Admin';
    const callerId = req.userPayload?.userId || null;
    logAudit(callerId, callerName, 'CONNECT_MONGODB_ATLAS', 'DATABASE', null, `Connected to Atlas cluster: ${connectResult.cluster}`, req.ip);

    res.json({
      success: true,
      message: 'MongoDB Atlas connected successfully and collections synchronized.',
      details: connectResult,
      syncResult,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger full migration/sync to MongoDB Atlas
apiRouter.post('/database/sync-to-atlas', requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await syncDataToMongoAtlas();
    const callerName = req.userPayload?.username || 'Admin';
    const callerId = req.userPayload?.userId || null;
    logAudit(callerId, callerName, 'SYNC_TO_ATLAS', 'DATABASE', null, 'Synchronized all collections to MongoDB Atlas', req.ip);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 3. CUSTOMERS & LEDGER
// -------------------------------------------------------------

// List customers
apiRouter.get('/customers', requireAuth, (req, res) => {
  try {
    const { search, category, status } = req.query;
    let query = 'SELECT * FROM customers WHERE 1=1';
    const params: any[] = [];

    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ? OR id LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }
    if (status === 'active') {
      query += ' AND isActive = 1';
    } else if (status === 'archived') {
      query += ' AND isActive = 0';
    }

    query += ' ORDER BY name ASC';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Customer
apiRouter.post('/customers', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, phone, email, address, category, openingBalance, notes, createdByName, createdById } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Customer name and phone number are required.' });
    }

    const cleanPhone = String(phone).trim();
    const cleanName = String(name).trim();

    // Check duplicate phone
    const existing = db.prepare('SELECT id, name FROM customers WHERE phone = ?').get(cleanPhone) as any;
    if (existing) {
      return res.status(409).json({
        error: `Customer with phone ${cleanPhone} already exists (${existing.name}).`,
        existingId: existing.id,
      });
    }

    const countRow = db.prepare('SELECT COUNT(*) as c FROM customers').get() as { c: number };
    const custId = `CUST-${String(countRow.c + 1).padStart(4, '0')}`;
    const openBal = parseFloat(openingBalance) || 0;
    const now = new Date().toISOString();

    db.exec('BEGIN TRANSACTION;');
    try {
      const insertCustomer = db.prepare(`
        INSERT INTO customers (id, name, phone, email, address, category, openingBalance, currentBalance, notes, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);
      insertCustomer.run(
        custId,
        cleanName,
        cleanPhone,
        email ? String(email).trim() : '',
        address ? String(address).trim() : '',
        category || 'Retail',
        openBal,
        openBal,
        notes || '',
        now,
        now
      );

      // Record Opening Balance in Ledger if > 0
      if (openBal !== 0) {
        const insertLedger = db.prepare(`
          INSERT INTO customer_ledger (id, customerId, transactionType, referenceId, referenceNumber, description, debit, credit, runningBalance, paymentMethod, createdAt)
          VALUES (?, ?, 'OPENING_BALANCE', NULL, 'OPEN-BAL', 'Opening Account Balance', ?, 0, ?, 'Account', ?)
        `);
        insertLedger.run(crypto.randomUUID(), custId, openBal, openBal, now);
      }

      db.exec('COMMIT;');

      // Mirror to MongoDB Atlas if connected
      if (mongoose.connection.readyState === 1) {
        CustomerModel.create({
          id: custId,
          name: cleanName,
          phone: cleanPhone,
          email: email || '',
          address: address || '',
          category: category || 'Retail',
          openingBalance: openBal,
          currentBalance: openBal,
          notes: notes || '',
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        }).catch((err) => console.error('Atlas Customer Create Err:', err.message));
      }

      const callerName = req.userPayload?.username || createdByName || 'User';
      const callerId = req.userPayload?.userId || createdById || null;
      logAudit(callerId, callerName, 'CREATE_CUSTOMER', 'CUSTOMERS', custId, `Added customer ${cleanName} with opening balance Rs ${openBal}`, req.ip);

      res.status(201).json({
        id: custId,
        name: cleanName,
        phone: cleanPhone,
        category: category || 'Retail',
        currentBalance: openBal,
      });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Customer
apiRouter.put('/customers/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, address, category, notes, isActive, updatedByName, updatedById } = req.body;

    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const now = new Date().toISOString();
    const cleanName = name !== undefined ? String(name).trim() : existing.name;
    const cleanPhone = phone !== undefined ? String(phone).trim() : existing.phone;
    const cleanEmail = email !== undefined ? String(email).trim() : existing.email;
    const cleanAddress = address !== undefined ? String(address).trim() : existing.address;
    const cleanCategory = category !== undefined ? category : existing.category;
    const cleanNotes = notes !== undefined ? notes : existing.notes;
    const cleanActive = isActive !== undefined ? Number(isActive) : existing.isActive;

    const update = db.prepare(`
      UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, category = ?, notes = ?, isActive = ?, updatedAt = ? WHERE id = ?
    `);
    update.run(cleanName, cleanPhone, cleanEmail, cleanAddress, cleanCategory, cleanNotes, cleanActive, now, id);

    // Mirror to MongoDB Atlas
    if (mongoose.connection.readyState === 1) {
      CustomerModel.findOneAndUpdate(
        { id },
        { name: cleanName, phone: cleanPhone, email: cleanEmail, address: cleanAddress, category: cleanCategory, notes: cleanNotes, isActive: cleanActive, updatedAt: now }
      ).catch((err) => console.error('Atlas Customer Update Err:', err.message));
    }

    const callerName = req.userPayload?.username || updatedByName || 'User';
    const callerId = req.userPayload?.userId || updatedById || null;
    logAudit(callerId, callerName, 'UPDATE_CUSTOMER', 'CUSTOMERS', id, `Updated customer ${cleanName}`, req.ip);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Single Customer details + balance
apiRouter.get('/customers/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    res.json(customer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Monthly Customer Ledger Summary & Statement
apiRouter.get('/customers/:id/monthly-summary', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { month, year, startDate: customStart, endDate: customEnd } = req.query;

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    let periodStart: string;
    let periodEnd: string;
    let periodLabel: string;

    if (customStart && customEnd) {
      periodStart = `${customStart}T00:00:00.000Z`;
      periodEnd = `${customEnd}T23:59:59.999Z`;
      periodLabel = `${customStart} to ${customEnd}`;
    } else {
      const selectedYear = parseInt(year as string, 10) || new Date().getFullYear();
      const selectedMonth = parseInt(month as string, 10) || new Date().getMonth() + 1;
      const start = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1, 0, 0, 0));
      const end = new Date(Date.UTC(selectedYear, selectedMonth, 0, 23, 59, 59, 999));
      periodStart = start.toISOString();
      periodEnd = end.toISOString();
      periodLabel = start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }

    const priorLedger = db.prepare(`
      SELECT COALESCE(SUM(debit), 0) as priorDebits, COALESCE(SUM(credit), 0) as priorCredits
      FROM customer_ledger
      WHERE customerId = ? AND createdAt < ?
    `).get(id, periodStart) as { priorDebits: number; priorCredits: number };

    const openingBal = priorLedger.priorDebits - priorLedger.priorCredits;

    const invoices = db.prepare(`
      SELECT * FROM invoices
      WHERE customerId = ? AND isCancelled = 0 AND createdAt >= ? AND createdAt <= ?
      ORDER BY createdAt ASC
    `).all(id, periodStart, periodEnd) as any[];

    const totalQtyRow = db.prepare(`
      SELECT COALESCE(SUM(ii.quantity), 0) as totalQuantity
      FROM invoice_items ii
      JOIN invoices i ON ii.invoiceId = i.id
      WHERE i.customerId = ? AND i.isCancelled = 0 AND i.createdAt >= ? AND i.createdAt <= ?
    `).get(id, periodStart, periodEnd) as { totalQuantity: number };

    let grossSales = 0;
    let discounts = 0;
    let netSales = 0;
    let directCashPaidAtSale = 0;

    for (const inv of invoices) {
      grossSales += inv.subtotal;
      discounts += inv.discountAmount;
      netSales += inv.grandTotal;
      if (inv.paidAmount > 0) {
        directCashPaidAtSale += inv.paidAmount;
      }
    }

    const payments = db.prepare(`
      SELECT * FROM payments
      WHERE customerId = ? AND isVoided = 0 AND createdAt >= ? AND createdAt <= ?
      ORDER BY createdAt ASC
    `).all(id, periodStart, periodEnd) as any[];

    const totalPaymentsReceivedInPeriod = payments.reduce((sum, p) => sum + p.amount, 0);

    const ledgerEntries = db.prepare(`
      SELECT * FROM customer_ledger
      WHERE customerId = ? AND createdAt >= ? AND createdAt <= ?
      ORDER BY createdAt ASC
    `).all(id, periodStart, periodEnd) as any[];

    let periodDebits = 0;
    let periodCredits = 0;
    for (const entry of ledgerEntries) {
      periodDebits += entry.debit;
      periodCredits += entry.credit;
    }

    const totalAmountDue = openingBal + periodDebits;
    const closingBalance = openingBal + periodDebits - periodCredits;

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        category: customer.category,
        overallBalance: customer.currentBalance,
      },
      period: {
        label: periodLabel,
        startDate: periodStart,
        endDate: periodEnd,
      },
      summary: {
        openingBalance: openingBal,
        invoiceCount: invoices.length,
        totalQuantitySold: totalQtyRow.totalQuantity || 0,
        grossSales,
        discounts,
        returns: 0,
        netSales,
        paymentsReceived: totalPaymentsReceivedInPeriod,
        directCashPaidAtSale,
        previousUnpaidBalance: openingBal,
        totalAmountDue,
        closingBalance,
      },
      invoices,
      payments,
      ledgerEntries,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Full Ledger with running balances
apiRouter.get('/customers/:id/ledger', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    let query = 'SELECT * FROM customer_ledger WHERE customerId = ?';
    const params: any[] = [id];

    if (startDate) {
      query += ' AND createdAt >= ?';
      params.push(`${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      query += ' AND createdAt <= ?';
      params.push(`${endDate}T23:59:59.999Z`);
    }

    query += ' ORDER BY createdAt ASC';
    const entries = db.prepare(query).all(...params);

    res.json({
      customer,
      entries,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 4. PRODUCTS & INVENTORY
// -------------------------------------------------------------

apiRouter.get('/products', requireAuth, (req, res) => {
  try {
    const { search, category, lowStock } = req.query;
    let query = 'SELECT * FROM products WHERE isActive = 1';
    const params: any[] = [];

    if (search) {
      query += ' AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (category && category !== 'All') {
      query += ' AND categoryName = ?';
      params.push(category);
    }
    if (lowStock === 'true') {
      query += ' AND stockQuantity <= lowStockThreshold';
    }

    query += ' ORDER BY name ASC';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/products', requireRole(['admin', 'manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const { name, sku, categoryName, costPrice, sellingPrice, stockQuantity, unit, barcode, lowStockThreshold, createdByName, createdById } = req.body;
    if (!name || sellingPrice === undefined || sellingPrice === null) {
      return res.status(400).json({ error: 'Product name and selling price are required.' });
    }

    let finalSku = sku ? String(sku).trim() : '';
    if (!finalSku) {
      const pCount = db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
      finalSku = `PROD-${String(pCount.c + 1).padStart(4, '0')}`;
    }

    const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(finalSku);
    if (existing) {
      return res.status(400).json({ error: `Product with SKU ${finalSku} already exists.` });
    }

    const prodId = crypto.randomUUID();
    const now = new Date().toISOString();
    const initStock = parseFloat(stockQuantity) || 0;
    const cost = parseFloat(costPrice) || 0;
    const sell = parseFloat(sellingPrice) || 0;
    const lowThreshold = parseFloat(lowStockThreshold) || 10;
    const cleanName = String(name).trim();

    db.exec('BEGIN TRANSACTION;');
    try {
      const insert = db.prepare(`
        INSERT INTO products (id, name, sku, categoryName, costPrice, sellingPrice, stockQuantity, unit, barcode, lowStockThreshold, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);
      insert.run(prodId, cleanName, finalSku, categoryName || 'General', cost, sell, initStock, unit || 'Bottle', barcode || '', lowThreshold, now, now);

      if (initStock > 0) {
        db.prepare(`
          INSERT INTO stock_movements (id, productId, movementType, quantity, previousStock, newStock, referenceId, reason, createdByName, createdAt)
          VALUES (?, ?, 'adjustment', ?, 0, ?, 'INITIAL', 'Initial stock entry', ?, ?)
        `).run(crypto.randomUUID(), prodId, initStock, initStock, createdByName || 'User', now);
      }

      db.exec('COMMIT;');

      // Mirror to MongoDB Atlas
      if (mongoose.connection.readyState === 1) {
        ProductModel.create({
          id: prodId,
          name: cleanName,
          sku: finalSku,
          categoryName: categoryName || 'General',
          costPrice: cost,
          sellingPrice: sell,
          stockQuantity: initStock,
          unit: unit || 'Bottle',
          barcode: barcode || '',
          lowStockThreshold: lowThreshold,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        }).catch((err) => console.error('Atlas Product Create Err:', err.message));
      }

      const callerName = req.userPayload?.username || createdByName || 'User';
      const callerId = req.userPayload?.userId || createdById || null;
      logAudit(callerId, callerName, 'CREATE_PRODUCT', 'INVENTORY', prodId, `Added product ${cleanName} (SKU: ${finalSku}) with stock ${initStock}`, req.ip);

      res.status(201).json({ success: true, id: prodId, sku: finalSku });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put('/products/:id', requireRole(['admin', 'manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { name, sku, categoryName, costPrice, sellingPrice, unit, barcode, lowStockThreshold, updatedByName, updatedById } = req.body;

    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!prod) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const now = new Date().toISOString();
    const cleanName = name !== undefined ? String(name).trim() : prod.name;
    const cleanSku = sku !== undefined ? String(sku).trim() : prod.sku;
    const cleanCategory = categoryName !== undefined ? categoryName : prod.categoryName;
    const cleanCost = costPrice !== undefined ? parseFloat(costPrice) : prod.costPrice;
    const cleanSell = sellingPrice !== undefined ? parseFloat(sellingPrice) : prod.sellingPrice;
    const cleanUnit = unit !== undefined ? unit : prod.unit;
    const cleanBarcode = barcode !== undefined ? barcode : prod.barcode;
    const cleanThreshold = lowStockThreshold !== undefined ? parseFloat(lowStockThreshold) : prod.lowStockThreshold;

    db.prepare(`
      UPDATE products SET name = ?, sku = ?, categoryName = ?, costPrice = ?, sellingPrice = ?, unit = ?, barcode = ?, lowStockThreshold = ?, updatedAt = ? WHERE id = ?
    `).run(cleanName, cleanSku, cleanCategory, cleanCost, cleanSell, cleanUnit, cleanBarcode, cleanThreshold, now, id);

    // Mirror to MongoDB Atlas
    if (mongoose.connection.readyState === 1) {
      ProductModel.findOneAndUpdate(
        { id },
        { name: cleanName, sku: cleanSku, categoryName: cleanCategory, costPrice: cleanCost, sellingPrice: cleanSell, unit: cleanUnit, barcode: cleanBarcode, lowStockThreshold: cleanThreshold, updatedAt: now }
      ).catch((err) => console.error('Atlas Product Update Err:', err.message));
    }

    const callerName = req.userPayload?.username || updatedByName || 'User';
    const callerId = req.userPayload?.userId || updatedById || null;
    logAudit(callerId, callerName, 'UPDATE_PRODUCT', 'INVENTORY', id, `Updated product details for ${cleanName}`, req.ip);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Manual Stock Adjustment
apiRouter.post('/products/:id/adjust-stock', requireRole(['admin', 'manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { adjustmentQuantity, reason, createdByName, createdById } = req.body;

    if (!reason || String(reason).trim().length === 0) {
      return res.status(400).json({ error: 'A valid reason is required for manual stock adjustment.' });
    }

    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!prod) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const adjQty = parseFloat(adjustmentQuantity);
    if (isNaN(adjQty) || adjQty === 0) {
      return res.status(400).json({ error: 'Please enter a valid non-zero adjustment quantity.' });
    }

    const newStock = prod.stockQuantity + adjQty;
    const userRole = req.userPayload?.role || 'cashier';
    if (newStock < 0 && userRole !== 'admin') {
      return res.status(400).json({ error: 'Negative stock is not permitted unless authorized by an Administrator.' });
    }

    const now = new Date().toISOString();
    const movementId = crypto.randomUUID();

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare('UPDATE products SET stockQuantity = ?, updatedAt = ? WHERE id = ?').run(newStock, now, id);

      db.prepare(`
        INSERT INTO stock_movements (id, productId, movementType, quantity, previousStock, newStock, referenceId, reason, createdByName, createdAt)
        VALUES (?, ?, 'adjustment', ?, ?, ?, 'MANUAL_ADJ', ?, ?, ?)
      `).run(movementId, id, adjQty, prod.stockQuantity, newStock, String(reason).trim(), createdByName || 'User', now);

      db.exec('COMMIT;');

      // Mirror to MongoDB Atlas
      if (mongoose.connection.readyState === 1) {
        ProductModel.findOneAndUpdate({ id }, { stockQuantity: newStock, updatedAt: now }).catch((err) => console.error(err));
        StockMovementModel.create({
          id: movementId,
          productId: id,
          movementType: 'adjustment',
          quantity: adjQty,
          previousStock: prod.stockQuantity,
          newStock,
          referenceId: 'MANUAL_ADJ',
          reason: String(reason).trim(),
          createdByName: createdByName || 'User',
          createdAt: now,
        }).catch((err) => console.error(err));
      }

      const callerName = req.userPayload?.username || createdByName || 'User';
      const callerId = req.userPayload?.userId || createdById || null;
      logAudit(callerId, callerName, 'ADJUST_STOCK', 'INVENTORY', id, `Adjusted stock for ${prod.name} by ${adjQty} (${String(reason).trim()})`, req.ip);

      res.json({ success: true, newStock });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Product stock movements history
apiRouter.get('/products/:id/movements', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const rows = db.prepare('SELECT * FROM stock_movements WHERE productId = ? ORDER BY createdAt DESC LIMIT 100').all(id);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 5. INVOICES & POS BILLING
// -------------------------------------------------------------

apiRouter.get('/invoices', requireAuth, (req, res) => {
  try {
    const { search, customerId, status, startDate, endDate, limit, offset } = req.query;
    let query = 'SELECT * FROM invoices WHERE 1=1';
    const params: any[] = [];

    if (search) {
      query += ' AND (invoiceNumber LIKE ? OR customerName LIKE ? OR customerPhone LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (customerId) {
      query += ' AND customerId = ?';
      params.push(customerId);
    }
    if (status && status !== 'All') {
      if (status === 'Cancelled') {
        query += ' AND isCancelled = 1';
      } else {
        query += ' AND paymentStatus = ? AND isCancelled = 0';
        params.push(status);
      }
    }
    if (startDate) {
      query += ' AND createdAt >= ?';
      params.push(`${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      query += ' AND createdAt <= ?';
      params.push(`${endDate}T23:59:59.999Z`);
    }

    query += ' ORDER BY createdAt DESC';
    const lim = parseInt(limit as string, 10) || 50;
    const off = parseInt(offset as string, 10) || 0;
    query += ` LIMIT ${lim} OFFSET ${off}`;

    const invoices = db.prepare(query).all(...params);
    res.json(invoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/invoices/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(id);
    const payments = db.prepare('SELECT * FROM payments WHERE invoiceId = ? AND isVoided = 0').all(id);
    res.json({ ...invoice, items, payments });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Atomic Invoice Creation (Fast POS Checkout)
apiRouter.post('/invoices', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      customerId,
      customerName,
      customerPhone,
      customerAddress,
      isWalkIn,
      items,
      subtotal,
      discountType,
      discountValue,
      discountAmount,
      taxAmount,
      grandTotal,
      paidAmount,
      paymentMethod,
      notes,
      createdByName,
      createdById,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invoice must contain at least one product item.' });
    }

    const now = new Date().toISOString();
    const invoiceId = crypto.randomUUID();

    const currentYear = new Date().getFullYear();
    const countRow = db.prepare("SELECT COUNT(*) as c FROM invoices WHERE invoiceNumber LIKE ?").get(`INV-${currentYear}-%`) as { c: number };
    const invoiceNumber = `INV-${currentYear}-${String(countRow.c + 1).padStart(4, '0')}`;

    const paid = parseFloat(paidAmount) || 0;
    const total = parseFloat(grandTotal) || 0;
    const balance = Math.max(0, total - paid);

    let paymentStatus = 'Unpaid';
    if (paid >= total) {
      paymentStatus = 'Paid';
    } else if (paid > 0) {
      paymentStatus = 'Partially Paid';
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      const insertInv = db.prepare(`
        INSERT INTO invoices (
          id, invoiceNumber, customerId, customerName, customerPhone, customerAddress, isWalkIn,
          subtotal, discountType, discountValue, discountAmount, taxAmount, grandTotal,
          paidAmount, balanceAmount, paymentMethod, paymentStatus, notes, createdById, createdByName,
          isCancelled, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `);
      insertInv.run(
        invoiceId,
        invoiceNumber,
        isWalkIn ? null : (customerId || null),
        customerName || (isWalkIn ? 'Walk-in Customer' : 'Customer'),
        customerPhone || '',
        customerAddress || '',
        isWalkIn ? 1 : 0,
        subtotal || 0,
        discountType || 'fixed',
        discountValue || 0,
        discountAmount || 0,
        taxAmount || 0,
        total,
        paid,
        balance,
        paymentMethod || 'Cash',
        paymentStatus,
        notes || '',
        createdById || null,
        createdByName || 'Staff',
        now,
        now
      );

      const insertItem = db.prepare(`
        INSERT INTO invoice_items (id, invoiceId, productId, productName, sku, unit, unitPrice, costPrice, quantity, discountAmount, totalAmount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateStock = db.prepare('UPDATE products SET stockQuantity = stockQuantity - ?, updatedAt = ? WHERE id = ?');
      const insertMovement = db.prepare(`
        INSERT INTO stock_movements (id, productId, movementType, quantity, previousStock, newStock, referenceId, reason, createdByName, createdAt)
        VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?, ?)
      `);

      const mongoItems: any[] = [];

      for (const it of items) {
        const itemId = crypto.randomUUID();
        const prod = db.prepare('SELECT stockQuantity, costPrice FROM products WHERE id = ?').get(it.productId) as any;
        const currentStock = prod ? prod.stockQuantity : 0;
        const costPrice = prod ? prod.costPrice : (it.costPrice || 0);
        const itemQty = parseFloat(it.quantity) || 1;
        const itemTotal = parseFloat(it.totalAmount) || (it.unitPrice * itemQty);

        insertItem.run(
          itemId,
          invoiceId,
          it.productId,
          it.productName,
          it.sku || '',
          it.unit || 'Bottle',
          it.unitPrice,
          costPrice,
          itemQty,
          it.discountAmount || 0,
          itemTotal
        );

        updateStock.run(itemQty, now, it.productId);

        insertMovement.run(
          crypto.randomUUID(),
          it.productId,
          -itemQty,
          currentStock,
          currentStock - itemQty,
          invoiceNumber,
          `Sale Invoice ${invoiceNumber}`,
          createdByName || 'Staff',
          now
        );

        mongoItems.push({
          id: itemId,
          invoiceId,
          productId: it.productId,
          productName: it.productName,
          sku: it.sku || '',
          unit: it.unit || 'Bottle',
          unitPrice: it.unitPrice,
          costPrice,
          quantity: itemQty,
          discountAmount: it.discountAmount || 0,
          totalAmount: itemTotal,
        });
      }

      if (!isWalkIn && customerId) {
        const cust = db.prepare('SELECT currentBalance FROM customers WHERE id = ?').get(customerId) as any;
        if (cust) {
          const newBalanceAfterDebit = cust.currentBalance + total;
          db.prepare(`
            INSERT INTO customer_ledger (id, customerId, transactionType, referenceId, referenceNumber, description, debit, credit, runningBalance, paymentMethod, createdAt)
            VALUES (?, ?, 'INVOICE', ?, ?, ?, ?, 0, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            customerId,
            invoiceId,
            invoiceNumber,
            `Invoice ${invoiceNumber} - Grand Total: Rs ${total}`,
            total,
            newBalanceAfterDebit,
            paymentMethod,
            now
          );

          let finalCustBal = newBalanceAfterDebit;

          if (paid > 0) {
            const receiptCount = db.prepare("SELECT COUNT(*) as c FROM payments WHERE receiptNumber LIKE ?").get(`REC-${currentYear}-%`) as { c: number };
            const receiptNumber = `REC-${currentYear}-${String(receiptCount.c + 1).padStart(4, '0')}`;
            const paymentId = crypto.randomUUID();

            db.prepare(`
              INSERT INTO payments (id, receiptNumber, customerId, customerName, invoiceId, invoiceNumber, amount, paymentMethod, referenceNumber, notes, createdById, createdByName, isVoided, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `).run(
              paymentId,
              receiptNumber,
              customerId,
              customerName,
              invoiceId,
              invoiceNumber,
              paid,
              paymentMethod,
              invoiceNumber,
              `Paid at sale checkout for ${invoiceNumber}`,
              createdById || null,
              createdByName || 'Staff',
              now
            );

            finalCustBal = newBalanceAfterDebit - paid;

            db.prepare(`
              INSERT INTO customer_ledger (id, customerId, transactionType, referenceId, referenceNumber, description, debit, credit, runningBalance, paymentMethod, createdAt)
              VALUES (?, ?, 'PAYMENT', ?, ?, ?, 0, ?, ?, ?, ?)
            `).run(
              crypto.randomUUID(),
              customerId,
              paymentId,
              receiptNumber,
              `Payment received for ${invoiceNumber}`,
              paid,
              finalCustBal,
              paymentMethod,
              now
            );
          }

          db.prepare('UPDATE customers SET currentBalance = ?, updatedAt = ? WHERE id = ?').run(finalCustBal, now, customerId);
        }
      }

      db.exec('COMMIT;');

      // Mirror to MongoDB Atlas
      if (mongoose.connection.readyState === 1) {
        InvoiceModel.create({
          id: invoiceId,
          invoiceNumber,
          customerId: isWalkIn ? null : (customerId || null),
          customerName: customerName || (isWalkIn ? 'Walk-in Customer' : 'Customer'),
          customerPhone: customerPhone || '',
          customerAddress: customerAddress || '',
          isWalkIn: isWalkIn ? 1 : 0,
          items: mongoItems,
          subtotal: subtotal || 0,
          discountType: discountType || 'fixed',
          discountValue: discountValue || 0,
          discountAmount: discountAmount || 0,
          taxAmount: taxAmount || 0,
          grandTotal: total,
          paidAmount: paid,
          balanceAmount: balance,
          paymentMethod: paymentMethod || 'Cash',
          paymentStatus: paymentStatus as any,
          notes: notes || '',
          createdById: createdById || null,
          createdByName: createdByName || 'Staff',
          isCancelled: 0,
          createdAt: now,
          updatedAt: now,
        }).catch((err) => console.error('Atlas Invoice Create Err:', err.message));
      }

      const callerName = req.userPayload?.username || createdByName || 'Staff';
      const callerId = req.userPayload?.userId || createdById || null;
      logAudit(callerId, callerName, 'CREATE_INVOICE', 'POS', invoiceId, `Created ${invoiceNumber} for ${customerName} (Total: Rs ${total}, Paid: Rs ${paid})`, req.ip);

      res.status(201).json({
        success: true,
        invoiceId,
        invoiceNumber,
        grandTotal: total,
        paidAmount: paid,
        balanceAmount: balance,
        paymentStatus,
      });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel / Void Invoice (Admin & Manager only)
apiRouter.post('/invoices/:id/cancel', requireRole(['admin', 'manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason, cancelledByName, cancelledById } = req.body;

    if (!reason || String(reason).trim().length === 0) {
      return res.status(400).json({ error: 'Cancellation reason is required.' });
    }

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }
    if (invoice.isCancelled) {
      return res.status(400).json({ error: 'Invoice is already cancelled.' });
    }

    const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(id) as any[];
    const now = new Date().toISOString();
    const cleanReason = String(reason).trim();
    const canceller = req.userPayload?.username || cancelledByName || 'Manager';

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        UPDATE invoices SET isCancelled = 1, cancelReason = ?, cancelledAt = ?, cancelledByName = ?, updatedAt = ? WHERE id = ?
      `).run(cleanReason, now, canceller, now, id);

      for (const item of items) {
        const prod = db.prepare('SELECT stockQuantity FROM products WHERE id = ?').get(item.productId) as any;
        const currentStock = prod ? prod.stockQuantity : 0;
        db.prepare('UPDATE products SET stockQuantity = stockQuantity + ?, updatedAt = ? WHERE id = ?').run(item.quantity, now, item.productId);

        db.prepare(`
          INSERT INTO stock_movements (id, productId, movementType, quantity, previousStock, newStock, referenceId, reason, createdByName, createdAt)
          VALUES (?, ?, 'return', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          item.productId,
          item.quantity,
          currentStock,
          currentStock + item.quantity,
          invoice.invoiceNumber,
          `Cancelled invoice ${invoice.invoiceNumber}: ${cleanReason}`,
          canceller,
          now
        );
      }

      if (invoice.customerId) {
        const cust = db.prepare('SELECT currentBalance FROM customers WHERE id = ?').get(invoice.customerId) as any;
        if (cust) {
          const netAdjustment = invoice.grandTotal - invoice.paidAmount;
          const newBal = cust.currentBalance - netAdjustment;

          db.prepare(`
            INSERT INTO customer_ledger (id, customerId, transactionType, referenceId, referenceNumber, description, debit, credit, runningBalance, paymentMethod, createdAt)
            VALUES (?, ?, 'RETURN', ?, ?, ?, 0, ?, ?, 'Adjustment', ?)
          `).run(
            crypto.randomUUID(),
            invoice.customerId,
            invoice.id,
            invoice.invoiceNumber,
            `Cancellation of ${invoice.invoiceNumber} (${cleanReason})`,
            netAdjustment,
            newBal,
            now
          );

          db.prepare('UPDATE customers SET currentBalance = ?, updatedAt = ? WHERE id = ?').run(newBal, now, invoice.customerId);
        }
      }

      db.exec('COMMIT;');

      // Mirror to MongoDB Atlas
      if (mongoose.connection.readyState === 1) {
        InvoiceModel.findOneAndUpdate(
          { id },
          { isCancelled: 1, cancelReason: cleanReason, cancelledAt: now, cancelledByName: canceller, updatedAt: now }
        ).catch((err) => console.error(err));
      }

      const callerId = req.userPayload?.userId || cancelledById || null;
      logAudit(callerId, canceller, 'CANCEL_INVOICE', 'INVOICES', id, `Cancelled invoice ${invoice.invoiceNumber}: ${cleanReason}`, req.ip);

      res.json({ success: true, message: `Invoice ${invoice.invoiceNumber} has been safely cancelled.` });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 6. PAYMENTS & UDHAAR COLLECTION
// -------------------------------------------------------------

apiRouter.get('/payments', requireAuth, (req, res) => {
  try {
    const { customerId, invoiceId, startDate, endDate } = req.query;
    let query = 'SELECT * FROM payments WHERE isVoided = 0';
    const params: any[] = [];

    if (customerId) {
      query += ' AND customerId = ?';
      params.push(customerId);
    }
    if (invoiceId) {
      query += ' AND invoiceId = ?';
      params.push(invoiceId);
    }
    if (startDate) {
      query += ' AND createdAt >= ?';
      params.push(`${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      query += ' AND createdAt <= ?';
      params.push(`${endDate}T23:59:59.999Z`);
    }

    query += ' ORDER BY createdAt DESC LIMIT 100';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/payments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { customerId, invoiceId, amount, paymentMethod, referenceNumber, notes, createdByName, createdById } = req.body;
    if (!customerId || !amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Customer and valid payment amount are required.' });
    }

    const payAmount = parseFloat(amount);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const currentYear = new Date().getFullYear();
    const countRow = db.prepare("SELECT COUNT(*) as c FROM payments WHERE receiptNumber LIKE ?").get(`REC-${currentYear}-%`) as { c: number };
    const receiptNumber = `REC-${currentYear}-${String(countRow.c + 1).padStart(4, '0')}`;
    const paymentId = crypto.randomUUID();
    const now = new Date().toISOString();

    let invoiceNum: string | null = null;
    let targetInvoice: any = null;
    if (invoiceId) {
      targetInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
      if (targetInvoice) {
        invoiceNum = targetInvoice.invoiceNumber;
      }
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        INSERT INTO payments (id, receiptNumber, customerId, customerName, invoiceId, invoiceNumber, amount, paymentMethod, referenceNumber, notes, createdById, createdByName, isVoided, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        paymentId,
        receiptNumber,
        customerId,
        customer.name,
        invoiceId || null,
        invoiceNum,
        payAmount,
        paymentMethod || 'Cash',
        referenceNumber || '',
        notes || '',
        createdById || null,
        createdByName || 'Staff',
        now
      );

      const newCustomerBalance = customer.currentBalance - payAmount;
      db.prepare('UPDATE customers SET currentBalance = ?, updatedAt = ? WHERE id = ?').run(newCustomerBalance, now, customerId);

      const desc = invoiceNum ? `Payment received for ${invoiceNum} [${receiptNumber}]` : `Account Payment / Udhaar Collection [${receiptNumber}]`;
      db.prepare(`
        INSERT INTO customer_ledger (id, customerId, transactionType, referenceId, referenceNumber, description, debit, credit, runningBalance, paymentMethod, createdAt)
        VALUES (?, ?, 'PAYMENT', ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), customerId, paymentId, receiptNumber, desc, payAmount, newCustomerBalance, paymentMethod || 'Cash', now);

      if (targetInvoice) {
        const newPaid = targetInvoice.paidAmount + payAmount;
        const newBal = Math.max(0, targetInvoice.grandTotal - newPaid);
        let newStatus = targetInvoice.paymentStatus;
        if (newPaid >= targetInvoice.grandTotal) {
          newStatus = 'Paid';
        } else if (newPaid > 0) {
          newStatus = 'Partially Paid';
        }

        db.prepare('UPDATE invoices SET paidAmount = ?, balanceAmount = ?, paymentStatus = ?, updatedAt = ? WHERE id = ?').run(
          newPaid,
          newBal,
          newStatus,
          now,
          invoiceId
        );
      }

      db.exec('COMMIT;');

      // Mirror to MongoDB Atlas
      if (mongoose.connection.readyState === 1) {
        PaymentModel.create({
          id: paymentId,
          receiptNumber,
          customerId,
          customerName: customer.name,
          invoiceId: invoiceId || null,
          invoiceNumber: invoiceNum,
          amount: payAmount,
          paymentMethod: paymentMethod || 'Cash',
          referenceNumber: referenceNumber || '',
          notes: notes || '',
          createdById: createdById || null,
          createdByName: createdByName || 'Staff',
          isVoided: 0,
          createdAt: now,
        }).catch((err) => console.error(err));
      }

      const callerName = req.userPayload?.username || createdByName || 'Staff';
      const callerId = req.userPayload?.userId || createdById || null;
      logAudit(callerId, callerName, 'RECORD_PAYMENT', 'PAYMENTS', paymentId, `Collected Rs ${payAmount} from ${customer.name} (${receiptNumber})`, req.ip);

      res.status(201).json({
        success: true,
        paymentId,
        receiptNumber,
        amount: payAmount,
        newCustomerBalance,
      });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Void Payment (Admin only)
apiRouter.post('/payments/:id/void', requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason, voidedByName, voidedById } = req.body;

    if (!reason || String(reason).trim().length === 0) {
      return res.status(400).json({ error: 'Void reason is required.' });
    }

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found.' });
    }
    if (payment.isVoided) {
      return res.status(400).json({ error: 'Payment has already been voided.' });
    }

    const now = new Date().toISOString();
    const cleanReason = String(reason).trim();
    const voider = req.userPayload?.username || voidedByName || 'Admin';

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare('UPDATE payments SET isVoided = 1, voidReason = ?, voidedAt = ?, voidedByName = ? WHERE id = ?').run(
        cleanReason,
        now,
        voider,
        id
      );

      const cust = db.prepare('SELECT currentBalance FROM customers WHERE id = ?').get(payment.customerId) as any;
      if (cust) {
        const newBal = cust.currentBalance + payment.amount;
        db.prepare('UPDATE customers SET currentBalance = ?, updatedAt = ? WHERE id = ?').run(newBal, now, payment.customerId);

        db.prepare(`
          INSERT INTO customer_ledger (id, customerId, transactionType, referenceId, referenceNumber, description, debit, credit, runningBalance, paymentMethod, createdAt)
          VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, ?, 0, ?, 'Adjustment', ?)
        `).run(
          crypto.randomUUID(),
          payment.customerId,
          payment.id,
          payment.receiptNumber,
          `Voided Payment ${payment.receiptNumber}: ${cleanReason}`,
          payment.amount,
          newBal,
          now
        );
      }

      if (payment.invoiceId) {
        const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(payment.invoiceId) as any;
        if (inv) {
          const newPaid = Math.max(0, inv.paidAmount - payment.amount);
          const newBal = inv.grandTotal - newPaid;
          let newStatus = 'Unpaid';
          if (newPaid >= inv.grandTotal) {
            newStatus = 'Paid';
          } else if (newPaid > 0) {
            newStatus = 'Partially Paid';
          }
          db.prepare('UPDATE invoices SET paidAmount = ?, balanceAmount = ?, paymentStatus = ?, updatedAt = ? WHERE id = ?').run(
            newPaid,
            newBal,
            newStatus,
            now,
            inv.id
          );
        }
      }

      db.exec('COMMIT;');

      // Mirror to MongoDB Atlas
      if (mongoose.connection.readyState === 1) {
        PaymentModel.findOneAndUpdate(
          { id },
          { isVoided: 1, voidReason: cleanReason, voidedAt: now, voidedByName: voider }
        ).catch((err) => console.error(err));
      }

      const callerId = req.userPayload?.userId || voidedById || null;
      logAudit(callerId, voider, 'VOID_PAYMENT', 'PAYMENTS', id, `Voided payment ${payment.receiptNumber} of Rs ${payment.amount}: ${cleanReason}`, req.ip);

      res.json({ success: true, message: `Payment ${payment.receiptNumber} successfully voided.` });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 7. SUPPLIERS & PURCHASES
// -------------------------------------------------------------

apiRouter.get('/suppliers', requireAuth, (req, res) => {
  try {
    const suppliers = db.prepare('SELECT * FROM suppliers WHERE isActive = 1 ORDER BY name ASC').all();
    res.json(suppliers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/suppliers', requireRole(['admin', 'manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const { name, company, phone, email, address, openingBalance, notes, createdByName, createdById } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Supplier name and phone are required.' });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const openBal = parseFloat(openingBalance) || 0;
    const cleanName = String(name).trim();
    const cleanPhone = String(phone).trim();

    db.prepare(`
      INSERT INTO suppliers (id, name, company, phone, email, address, openingBalance, currentBalance, notes, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, cleanName, company || '', cleanPhone, email || '', address || '', openBal, openBal, notes || '', now, now);

    // Mirror to MongoDB Atlas
    if (mongoose.connection.readyState === 1) {
      SupplierModel.create({
        id,
        name: cleanName,
        company: company || '',
        phone: cleanPhone,
        email: email || '',
        address: address || '',
        openingBalance: openBal,
        currentBalance: openBal,
        notes: notes || '',
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      }).catch((err) => console.error(err));
    }

    const callerName = req.userPayload?.username || createdByName || 'User';
    const callerId = req.userPayload?.userId || createdById || null;
    logAudit(callerId, callerName, 'CREATE_SUPPLIER', 'SUPPLIERS', id, `Added supplier ${cleanName}`, req.ip);

    res.status(201).json({ id, name: cleanName, phone: cleanPhone });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/purchases', requireAuth, (req, res) => {
  try {
    const purchases = db.prepare('SELECT * FROM purchases ORDER BY createdAt DESC LIMIT 100').all();
    res.json(purchases);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/purchases', requireRole(['admin', 'manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const { supplierId, supplierName, items, totalAmount, paidAmount, paymentMethod, notes, createdByName, createdById } = req.body;
    if (!supplierId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Supplier and purchase items are required.' });
    }

    const currentYear = new Date().getFullYear();
    const countRow = db.prepare("SELECT COUNT(*) as c FROM purchases WHERE purchaseNumber LIKE ?").get(`PUR-${currentYear}-%`) as { c: number };
    const purchaseNumber = `PUR-${currentYear}-${String(countRow.c + 1).padStart(4, '0')}`;
    const purchaseId = crypto.randomUUID();
    const now = new Date().toISOString();

    const total = parseFloat(totalAmount) || 0;
    const paid = parseFloat(paidAmount) || 0;
    const balance = Math.max(0, total - paid);

    let paymentStatus = 'Unpaid';
    if (paid >= total) {
      paymentStatus = 'Paid';
    } else if (paid > 0) {
      paymentStatus = 'Partially Paid';
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        INSERT INTO purchases (id, purchaseNumber, supplierId, supplierName, totalAmount, paidAmount, balanceAmount, paymentStatus, paymentMethod, notes, createdById, createdByName, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        purchaseId,
        purchaseNumber,
        supplierId,
        supplierName,
        total,
        paid,
        balance,
        paymentStatus,
        paymentMethod || 'Cash',
        notes || '',
        createdById || null,
        createdByName || 'Staff',
        now
      );

      const mongoItems: any[] = [];
      for (const item of items) {
        const prod = db.prepare('SELECT stockQuantity FROM products WHERE id = ?').get(item.productId) as any;
        const currentStock = prod ? prod.stockQuantity : 0;
        const itemQty = parseFloat(item.quantity) || 1;
        const itemCost = parseFloat(item.unitCost) || 0;
        const itemId = crypto.randomUUID();

        db.prepare(`
          INSERT INTO purchase_items (id, purchaseId, productId, productName, unit, quantity, unitCost, totalAmount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          itemId,
          purchaseId,
          item.productId,
          item.productName,
          item.unit || 'Piece',
          itemQty,
          itemCost,
          itemQty * itemCost
        );

        db.prepare('UPDATE products SET stockQuantity = stockQuantity + ?, costPrice = ?, updatedAt = ? WHERE id = ?').run(
          itemQty,
          itemCost > 0 ? itemCost : (prod ? prod.costPrice : 0),
          now,
          item.productId
        );

        db.prepare(`
          INSERT INTO stock_movements (id, productId, movementType, quantity, previousStock, newStock, referenceId, reason, createdByName, createdAt)
          VALUES (?, ?, 'purchase', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          item.productId,
          itemQty,
          currentStock,
          currentStock + itemQty,
          purchaseNumber,
          `Purchase ${purchaseNumber}`,
          createdByName || 'Staff',
          now
        );

        mongoItems.push({
          id: itemId,
          purchaseId,
          productId: item.productId,
          productName: item.productName,
          unit: item.unit || 'Piece',
          quantity: itemQty,
          unitCost: itemCost,
          totalAmount: itemQty * itemCost,
        });
      }

      if (balance > 0) {
        db.prepare('UPDATE suppliers SET currentBalance = currentBalance + ?, updatedAt = ? WHERE id = ?').run(balance, now, supplierId);
      }

      db.exec('COMMIT;');

      // Mirror to MongoDB Atlas
      if (mongoose.connection.readyState === 1) {
        PurchaseModel.create({
          id: purchaseId,
          purchaseNumber,
          supplierId,
          supplierName,
          items: mongoItems,
          totalAmount: total,
          paidAmount: paid,
          balanceAmount: balance,
          paymentStatus: paymentStatus as any,
          paymentMethod: paymentMethod || 'Cash',
          notes: notes || '',
          createdById: createdById || null,
          createdByName: createdByName || 'Staff',
          createdAt: now,
        }).catch((err) => console.error(err));
      }

      const callerName = req.userPayload?.username || createdByName || 'Staff';
      const callerId = req.userPayload?.userId || createdById || null;
      logAudit(callerId, callerName, 'RECORD_PURCHASE', 'PURCHASES', purchaseId, `Created purchase ${purchaseNumber} from ${supplierName} for Rs ${total}`, req.ip);

      res.status(201).json({ success: true, purchaseId, purchaseNumber });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 8. EXPENSES MANAGEMENT
// -------------------------------------------------------------

apiRouter.get('/expenses', requireAuth, (req, res) => {
  try {
    const { category, startDate, endDate } = req.query;
    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params: any[] = [];

    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }
    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY date DESC, createdAt DESC LIMIT 150';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/expenses', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, category, amount, paymentMethod, date, description, createdByName, createdById } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ error: 'Expense title and amount are required.' });
    }

    const expId = crypto.randomUUID();
    const now = new Date().toISOString();
    const expAmount = parseFloat(amount) || 0;
    const expDate = date || now.split('T')[0];
    const cleanTitle = String(title).trim();

    db.prepare(`
      INSERT INTO expenses (id, title, category, amount, paymentMethod, date, description, createdById, createdByName, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      expId,
      cleanTitle,
      category || 'Miscellaneous',
      expAmount,
      paymentMethod || 'Cash',
      expDate,
      description || '',
      createdById || null,
      createdByName || 'Staff',
      now
    );

    // Mirror to MongoDB Atlas
    if (mongoose.connection.readyState === 1) {
      ExpenseModel.create({
        id: expId,
        title: cleanTitle,
        category: category || 'Miscellaneous',
        amount: expAmount,
        paymentMethod: paymentMethod || 'Cash',
        date: expDate,
        description: description || '',
        createdById: createdById || null,
        createdByName: createdByName || 'Staff',
        createdAt: now,
      }).catch((err) => console.error(err));
    }

    const callerName = req.userPayload?.username || createdByName || 'Staff';
    const callerId = req.userPayload?.userId || createdById || null;
    logAudit(callerId, callerName, 'CREATE_EXPENSE', 'EXPENSES', expId, `Added expense: ${cleanTitle} (Rs ${expAmount})`, req.ip);

    res.status(201).json({ success: true, id: expId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete('/expenses/:id', requireRole(['admin', 'manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { deletedByName, deletedById } = req.body;

    const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as any;
    if (!exp) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);

    // Mirror to MongoDB Atlas
    if (mongoose.connection.readyState === 1) {
      ExpenseModel.findOneAndDelete({ id }).catch((err) => console.error(err));
    }

    const callerName = req.userPayload?.username || deletedByName || 'User';
    const callerId = req.userPayload?.userId || deletedById || null;
    logAudit(callerId, callerName, 'DELETE_EXPENSE', 'EXPENSES', id, `Deleted expense: ${exp.title} (Rs ${exp.amount})`, req.ip);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 9. DASHBOARD STATS & REAL-TIME REPORTS
// -------------------------------------------------------------

apiRouter.get('/dashboard/stats', requireAuth, (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayStart = `${todayStr}T00:00:00.000Z`;
    const todayEnd = `${todayStr}T23:59:59.999Z`;

    const todaySalesRow = db.prepare(`
      SELECT COALESCE(SUM(grandTotal), 0) as total, COUNT(*) as count
      FROM invoices
      WHERE isCancelled = 0 AND createdAt >= ? AND createdAt <= ?
    `).get(todayStart, todayEnd) as { total: number; count: number };

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)).toISOString();
    const monthSalesRow = db.prepare(`
      SELECT COALESCE(SUM(grandTotal), 0) as total, COUNT(*) as count
      FROM invoices
      WHERE isCancelled = 0 AND createdAt >= ?
    `).get(monthStart) as { total: number; count: number };

    const totalReceivedRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE isVoided = 0
    `).get() as { total: number };

    const outstandingRow = db.prepare(`
      SELECT COALESCE(SUM(currentBalance), 0) as total FROM customers WHERE currentBalance > 0 AND isActive = 1
    `).get() as { total: number };

    const expensesRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses').get() as { total: number };
    const custCountRow = db.prepare('SELECT COUNT(*) as count FROM customers WHERE isActive = 1').get() as { count: number };
    const invCountRow = db.prepare('SELECT COUNT(*) as count FROM invoices WHERE isCancelled = 0').get() as { count: number };
    const lowStockCountRow = db.prepare('SELECT COUNT(*) as count FROM products WHERE isActive = 1 AND stockQuantity <= lowStockThreshold').get() as { count: number };

    const cogsRow = db.prepare(`
      SELECT COALESCE(SUM(ii.costPrice * ii.quantity), 0) as cogs
      FROM invoice_items ii
      JOIN invoices i ON ii.invoiceId = i.id
      WHERE i.isCancelled = 0
    `).get() as { cogs: number };

    const allNetSalesRow = db.prepare('SELECT COALESCE(SUM(grandTotal), 0) as total FROM invoices WHERE isCancelled = 0').get() as { total: number };
    const estimatedProfit = allNetSalesRow.total - cogsRow.cogs - expensesRow.total;

    const recentInvoices = db.prepare(`
      SELECT id, invoiceNumber, customerName, grandTotal, paidAmount, balanceAmount, paymentStatus, createdAt
      FROM invoices
      ORDER BY createdAt DESC
      LIMIT 5
    `).all();

    const topCustomers = db.prepare(`
      SELECT customerId, customerName, COUNT(*) as invoiceCount, SUM(grandTotal) as totalSpent
      FROM invoices
      WHERE isCancelled = 0 AND customerId IS NOT NULL
      GROUP BY customerId
      ORDER BY totalSpent DESC
      LIMIT 5
    `).all();

    const lowStockItems = db.prepare(`
      SELECT id, name, sku, stockQuantity, unit, lowStockThreshold
      FROM products
      WHERE isActive = 1 AND stockQuantity <= lowStockThreshold
      ORDER BY stockQuantity ASC
      LIMIT 5
    `).all();

    res.json({
      todaySales: todaySalesRow.total,
      todayInvoicesCount: todaySalesRow.count,
      monthlySales: monthSalesRow.total,
      totalReceived: totalReceivedRow.total,
      outstandingBalance: outstandingRow.total,
      totalExpenses: expensesRow.total,
      estimatedProfit,
      totalCustomers: custCountRow.count,
      totalInvoices: invCountRow.count,
      lowStockCount: lowStockCountRow.count,
      recentInvoices,
      topCustomers,
      lowStockItems,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/reports/summary', requireAuth, (req, res) => {
  try {
    const { reportType = 'sales', startDate, endDate } = req.query;

    const start = startDate ? `${startDate}T00:00:00.000Z` : '2000-01-01T00:00:00.000Z';
    const end = endDate ? `${endDate}T23:59:59.999Z` : '2099-12-31T23:59:59.999Z';

    if (reportType === 'customer-sales') {
      const rows = db.prepare(`
        SELECT
          c.id, c.name, c.phone, c.category, c.currentBalance,
          COUNT(i.id) as invoiceCount,
          COALESCE(SUM(i.grandTotal), 0) as totalPurchased,
          COALESCE(SUM(i.paidAmount), 0) as totalPaid
        FROM customers c
        LEFT JOIN invoices i ON c.id = i.customerId AND i.isCancelled = 0 AND i.createdAt >= ? AND i.createdAt <= ?
        GROUP BY c.id
        ORDER BY totalPurchased DESC
      `).all(start, end);
      return res.json(rows);
    }

    if (reportType === 'product-sales') {
      const rows = db.prepare(`
        SELECT
          ii.productId, ii.productName, ii.sku, ii.unit,
          SUM(ii.quantity) as totalQtySold,
          SUM(ii.totalAmount) as totalRevenue,
          SUM(ii.quantity * ii.costPrice) as totalCost,
          (SUM(ii.totalAmount) - SUM(ii.quantity * ii.costPrice)) as grossProfit
        FROM invoice_items ii
        JOIN invoices i ON ii.invoiceId = i.id
        WHERE i.isCancelled = 0 AND i.createdAt >= ? AND i.createdAt <= ?
        GROUP BY ii.productId
        ORDER BY totalRevenue DESC
      `).all(start, end);
      return res.json(rows);
    }

    if (reportType === 'udhaar-aging') {
      const rows = db.prepare(`
        SELECT id, name, phone, address, category, currentBalance, updatedAt
        FROM customers
        WHERE currentBalance > 0 AND isActive = 1
        ORDER BY currentBalance DESC
      `).all();
      return res.json(rows);
    }

    if (reportType === 'inventory-valuation') {
      const rows = db.prepare(`
        SELECT id, name, sku, categoryName, costPrice, sellingPrice, stockQuantity, unit,
               (costPrice * stockQuantity) as costValuation,
               (sellingPrice * stockQuantity) as retailValuation
        FROM products
        WHERE isActive = 1
        ORDER BY name ASC
      `).all();
      return res.json(rows);
    }

    const rows = db.prepare(`
      SELECT
        substr(createdAt, 1, 10) as saleDate,
        COUNT(*) as invoiceCount,
        SUM(subtotal) as grossSales,
        SUM(discountAmount) as discounts,
        SUM(grandTotal) as netSales,
        SUM(paidAmount) as collected,
        SUM(balanceAmount) as creditExtended
      FROM invoices
      WHERE isCancelled = 0 AND createdAt >= ? AND createdAt <= ?
      GROUP BY substr(createdAt, 1, 10)
      ORDER BY saleDate DESC
    `).all(start, end);

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// 10. SETTINGS, BACKUP, RESTORE & AUDIT LOGS
// -------------------------------------------------------------

apiRouter.get('/settings', (req, res) => {
  try {
    const settings = db.prepare("SELECT * FROM business_settings WHERE id = 'default'").get();
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put('/settings', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Only allow non-admins to toggle theme preference
    const keys = Object.keys(req.body || {});
    const isThemeOnly = keys.length === 1 && keys[0] === 'theme';
    if (!isThemeOnly && req.userPayload?.role !== 'admin') {
      return res.status(403).json({ error: 'Only Administrators can modify business settings.' });
    }

    const existingSettings = (db.prepare("SELECT * FROM business_settings WHERE id = 'default'").get() as any) || {};
    const {
      businessName = existingSettings.businessName,
      tagline = existingSettings.tagline,
      phone = existingSettings.phone,
      email = existingSettings.email,
      address = existingSettings.address,
      currencySymbol = existingSettings.currencySymbol,
      taxPercentage = existingSettings.taxPercentage,
      receiptFooter = existingSettings.receiptFooter,
      invoicePrefix = existingSettings.invoicePrefix,
      lowStockDefaultThreshold = existingSettings.lowStockDefaultThreshold,
      theme = existingSettings.theme,
      logoDataUrl = existingSettings.logoDataUrl,
      mongoDbUriConfigured = existingSettings.mongoDbUriConfigured,
      updatedByName,
      updatedById,
    } = req.body;

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE business_settings SET
        businessName = ?, tagline = ?, phone = ?, email = ?, address = ?,
        currencySymbol = ?, taxPercentage = ?, receiptFooter = ?, invoicePrefix = ?,
        lowStockDefaultThreshold = ?, theme = ?, logoDataUrl = ?, mongoDbUriConfigured = ?, updatedAt = ?
      WHERE id = 'default'
    `).run(
      businessName || 'Freshway Water',
      tagline || '',
      phone || '',
      email || '',
      address || '',
      currencySymbol || 'Rs',
      parseFloat(taxPercentage) || 0,
      receiptFooter || '',
      invoicePrefix || 'INV',
      parseInt(lowStockDefaultThreshold, 10) || 10,
      theme || 'light',
      logoDataUrl || '',
      mongoDbUriConfigured || '',
      now
    );

    // Mirror to MongoDB Atlas if connected
    if (mongoose.connection.readyState === 1) {
      BusinessSettingsModel.findOneAndUpdate(
        { id: 'default' },
        {
          businessName: businessName || 'Freshway Water',
          tagline: tagline || '',
          phone: phone || '',
          email: email || '',
          address: address || '',
          currencySymbol: currencySymbol || 'Rs',
          taxPercentage: parseFloat(taxPercentage) || 0,
          receiptFooter: receiptFooter || '',
          invoicePrefix: invoicePrefix || 'INV',
          lowStockDefaultThreshold: parseInt(lowStockDefaultThreshold, 10) || 10,
          theme: theme || 'light',
          logoDataUrl: logoDataUrl || '',
          mongoDbUriConfigured: mongoDbUriConfigured || '',
          updatedAt: now,
        },
        { upsert: true }
      ).catch((err) => console.error(err));
    }

    const callerName = req.userPayload?.username || updatedByName || 'Admin';
    const callerId = req.userPayload?.userId || updatedById || null;
    logAudit(callerId, callerName, 'UPDATE_SETTINGS', 'SETTINGS', 'default', `Updated business profile and brand settings`, req.ip);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Full Database Backup Export (JSON snapshot)
apiRouter.get('/backup', requireRole(['admin']), (req, res) => {
  try {
    const data = {
      version: '2.0.0',
      databaseEngine: 'MongoDB Atlas / Multi-Store',
      exportedAt: new Date().toISOString(),
      business_settings: db.prepare('SELECT * FROM business_settings').all(),
      users: db.prepare('SELECT id, username, email, fullName, role, isActive, createdAt, updatedAt FROM users').all(),
      customers: db.prepare('SELECT * FROM customers').all(),
      categories: db.prepare('SELECT * FROM categories').all(),
      products: db.prepare('SELECT * FROM products').all(),
      stock_movements: db.prepare('SELECT * FROM stock_movements').all(),
      invoices: db.prepare('SELECT * FROM invoices').all(),
      invoice_items: db.prepare('SELECT * FROM invoice_items').all(),
      payments: db.prepare('SELECT * FROM payments').all(),
      customer_ledger: db.prepare('SELECT * FROM customer_ledger').all(),
      suppliers: db.prepare('SELECT * FROM suppliers').all(),
      purchases: db.prepare('SELECT * FROM purchases').all(),
      purchase_items: db.prepare('SELECT * FROM purchase_items').all(),
      expenses: db.prepare('SELECT * FROM expenses').all(),
      audit_logs: db.prepare('SELECT * FROM audit_logs').all(),
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="freshway_pos_backup_${new Date().toISOString().split('T')[0]}.json"`);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Restore from validated JSON snapshot
apiRouter.post('/restore', requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { backupData, adminName, adminId } = req.body;
    if (!backupData || !backupData.customers || !backupData.products) {
      return res.status(400).json({ error: 'Invalid backup format. Required collections missing.' });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec('DELETE FROM invoice_items;');
      db.exec('DELETE FROM invoices;');
      db.exec('DELETE FROM payments;');
      db.exec('DELETE FROM customer_ledger;');
      db.exec('DELETE FROM stock_movements;');
      db.exec('DELETE FROM purchase_items;');
      db.exec('DELETE FROM purchases;');
      db.exec('DELETE FROM suppliers;');
      db.exec('DELETE FROM expenses;');
      db.exec('DELETE FROM products;');
      db.exec('DELETE FROM customers;');

      if (Array.isArray(backupData.customers)) {
        const stmt = db.prepare(`
          INSERT INTO customers (id, name, phone, email, address, category, openingBalance, currentBalance, notes, isActive, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of backupData.customers) {
          stmt.run(c.id, c.name, c.phone, c.email || '', c.address || '', c.category || 'Retail', c.openingBalance || 0, c.currentBalance || 0, c.notes || '', c.isActive !== undefined ? c.isActive : 1, c.createdAt, c.updatedAt);
        }
      }

      if (Array.isArray(backupData.products)) {
        const stmt = db.prepare(`
          INSERT INTO products (id, name, sku, categoryName, costPrice, sellingPrice, stockQuantity, unit, barcode, lowStockThreshold, isActive, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of backupData.products) {
          stmt.run(p.id, p.name, p.sku, p.categoryName || 'General', p.costPrice || 0, p.sellingPrice || 0, p.stockQuantity || 0, p.unit || 'Bottle', p.barcode || '', p.lowStockThreshold || 10, p.isActive !== undefined ? p.isActive : 1, p.createdAt, p.updatedAt);
        }
      }

      if (Array.isArray(backupData.invoices)) {
        const stmt = db.prepare(`
          INSERT INTO invoices (id, invoiceNumber, customerId, customerName, customerPhone, customerAddress, isWalkIn, subtotal, discountType, discountValue, discountAmount, taxAmount, grandTotal, paidAmount, balanceAmount, paymentMethod, paymentStatus, notes, createdById, createdByName, isCancelled, cancelReason, cancelledAt, cancelledByName, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const i of backupData.invoices) {
          stmt.run(i.id, i.invoiceNumber, i.customerId || null, i.customerName, i.customerPhone || '', i.customerAddress || '', i.isWalkIn ? 1 : 0, i.subtotal, i.discountType || 'fixed', i.discountValue || 0, i.discountAmount || 0, i.taxAmount || 0, i.grandTotal, i.paidAmount || 0, i.balanceAmount || 0, i.paymentMethod, i.paymentStatus, i.notes || '', i.createdById || null, i.createdByName || 'Staff', i.isCancelled ? 1 : 0, i.cancelReason || '', i.cancelledAt || '', i.cancelledByName || '', i.createdAt, i.updatedAt);
        }
      }

      if (Array.isArray(backupData.invoice_items)) {
        const stmt = db.prepare(`
          INSERT INTO invoice_items (id, invoiceId, productId, productName, sku, unit, unitPrice, costPrice, quantity, discountAmount, totalAmount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const it of backupData.invoice_items) {
          stmt.run(it.id, it.invoiceId, it.productId, it.productName, it.sku || '', it.unit || 'Bottle', it.unitPrice, it.costPrice || 0, it.quantity, it.discountAmount || 0, it.totalAmount);
        }
      }

      if (Array.isArray(backupData.payments)) {
        const stmt = db.prepare(`
          INSERT INTO payments (id, receiptNumber, customerId, customerName, invoiceId, invoiceNumber, amount, paymentMethod, referenceNumber, notes, createdById, createdByName, isVoided, voidReason, voidedAt, voidedByName, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of backupData.payments) {
          stmt.run(p.id, p.receiptNumber, p.customerId, p.customerName, p.invoiceId || null, p.invoiceNumber || '', p.amount, p.paymentMethod, p.referenceNumber || '', p.notes || '', p.createdById || null, p.createdByName || 'Staff', p.isVoided ? 1 : 0, p.voidReason || '', p.voidedAt || '', p.voidedByName || '', p.createdAt);
        }
      }

      if (Array.isArray(backupData.customer_ledger)) {
        const stmt = db.prepare(`
          INSERT INTO customer_ledger (id, customerId, transactionType, referenceId, referenceNumber, description, debit, credit, runningBalance, paymentMethod, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const l of backupData.customer_ledger) {
          stmt.run(l.id, l.customerId, l.transactionType, l.referenceId || null, l.referenceNumber || '', l.description, l.debit || 0, l.credit || 0, l.runningBalance || 0, l.paymentMethod || '', l.createdAt);
        }
      }

      if (Array.isArray(backupData.suppliers)) {
        const stmt = db.prepare(`
          INSERT INTO suppliers (id, name, company, phone, email, address, openingBalance, currentBalance, notes, isActive, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of backupData.suppliers) {
          stmt.run(s.id, s.name, s.company || '', s.phone, s.email || '', s.address || '', s.openingBalance || 0, s.currentBalance || 0, s.notes || '', s.isActive !== undefined ? s.isActive : 1, s.createdAt, s.updatedAt);
        }
      }

      if (Array.isArray(backupData.purchases)) {
        const stmt = db.prepare(`
          INSERT INTO purchases (id, purchaseNumber, supplierId, supplierName, totalAmount, paidAmount, balanceAmount, paymentStatus, paymentMethod, notes, createdById, createdByName, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const pur of backupData.purchases) {
          stmt.run(pur.id, pur.purchaseNumber, pur.supplierId, pur.supplierName, pur.totalAmount, pur.paidAmount || 0, pur.balanceAmount || 0, pur.paymentStatus, pur.paymentMethod, pur.notes || '', pur.createdById || null, pur.createdByName || 'Staff', pur.createdAt);
        }
      }

      if (Array.isArray(backupData.expenses)) {
        const stmt = db.prepare(`
          INSERT INTO expenses (id, title, category, amount, paymentMethod, date, description, createdById, createdByName, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const exp of backupData.expenses) {
          stmt.run(exp.id, exp.title, exp.category, exp.amount, exp.paymentMethod, exp.date, exp.description || '', exp.createdById || null, exp.createdByName || 'Staff', exp.createdAt);
        }
      }

      db.exec('COMMIT;');

      // If Atlas connected, trigger sync to update Atlas
      if (mongoose.connection.readyState === 1) {
        syncDataToMongoAtlas().catch((err) => console.error(err));
      }

      const callerName = req.userPayload?.username || adminName || 'Admin';
      const callerId = req.userPayload?.userId || adminId || null;
      logAudit(callerId, callerName, 'RESTORE_DATABASE', 'SETTINGS', 'SYSTEM', 'Restored system database from backup snapshot', req.ip);

      res.json({ success: true, message: 'Database restored successfully from backup archive.' });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Audit Logs
apiRouter.get('/audit-logs', requireAuth, (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT 150').all();
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
