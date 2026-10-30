import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

// Resolve persistent cryptographic HMAC signing key (never falls back to weak static keys)
function getOrCreateAuthSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim().length >= 32) {
    return process.env.AUTH_SECRET.trim();
  }

  try {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const secretFile = path.join(dataDir, '.auth_secret');
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf-8').trim();
      if (existing.length >= 64) {
        return existing;
      }
    }
    const generated = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretFile, generated, { encoding: 'utf-8', mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(64).toString('hex');
  }
}

const JWT_SECRET = getOrCreateAuthSecret();

// PBKDF2 Password Hashing with 100,000 iterations & SHA-512 (NIST SP 800-132 standard)
export function hashPassword(password: string, customSalt?: string): { hash: string; salt: string } {
  const salt = customSalt || crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

// Timing-safe password verification to prevent timing attack vulnerabilities
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  try {
    const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');
    const storedBuffer = Buffer.from(storedHash, 'hex');
    if (computedBuffer.length !== storedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(computedBuffer, storedBuffer);
  } catch {
    return false;
  }
}

export interface TokenPayload {
  userId: string;
  username: string;
  role: 'admin' | 'manager' | 'cashier';
  exp: number; // Unix timestamp in seconds
}

// Generate HMAC-SHA256 Signed Bearer Token (24-hour expiration)
export function generateToken(user: { id: string; username: string; role: 'admin' | 'manager' | 'cashier' }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload: TokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${encodedPayload}`)
    .digest('base64url');

  return `${header}.${encodedPayload}.${signature}`;
}

// Verify HMAC-SHA256 Signed Bearer Token using constant-time comparison
export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as TokenPayload;
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Token expired
    }

    return decodedPayload;
  } catch {
    return null;
  }
}

// Rate Limiting & Brute-Force Protection
interface AttemptRecord {
  count: number;
  firstAttempt: number;
  blockedUntil: number;
}

const loginAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes block

export function checkRateLimit(key: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record) return { allowed: true };

  if (record.blockedUntil > now) {
    const waitSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  if (now - record.firstAttempt > WINDOW_MS) {
    loginAttempts.delete(key);
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_DURATION_MS;
    const waitSeconds = Math.ceil(BLOCK_DURATION_MS / 1000);
    return { allowed: false, waitSeconds };
  }

  return { allowed: true };
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || now - record.firstAttempt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now, blockedUntil: 0 });
  } else {
    record.count += 1;
    if (record.count >= MAX_ATTEMPTS) {
      record.blockedUntil = now + BLOCK_DURATION_MS;
    }
  }
}

export function recordSuccessfulAttempt(key: string): void {
  loginAttempts.delete(key);
}

// NoSQL Injection Guard & Input Sanitization
// Recursively sanitizes objects to block keys starting with '$' or containing '.'
export function sanitizeNoSql(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeNoSql);
  }

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith('$') || key.includes('.')) {
      continue; // Strip suspicious MongoDB operator key
    }
    clean[key] = sanitizeNoSql(value);
  }
  return clean;
}

// Express Middleware: NoSQL Sanitization
export function noSqlSanitizerMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') req.body = sanitizeNoSql(req.body);
  if (req.query && typeof req.query === 'object') {
    const cleanedQuery = sanitizeNoSql(req.query);
    for (const key of Object.keys(req.query)) {
      delete (req.query as any)[key];
    }
    Object.assign(req.query, cleanedQuery);
  }
  if (req.params && typeof req.params === 'object') req.params = sanitizeNoSql(req.params);
  next();
}

// Express Middleware: HTTP Security Headers (OWASP) + Cross-Origin (Vercel <-> Render) CORS
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // CORS configuration for Vercel frontend + Render backend deployment
  const allowedOrigin = process.env.ALLOWED_ORIGIN || req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
}

// Extended Request with Cryptographically Authenticated User
export interface AuthenticatedRequest extends Request {
  userPayload?: TokenPayload;
}

// Middleware: Extract & Verify Bearer Token
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || (req.headers['x-auth-token'] as string);
  if (!authHeader) {
    return next();
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
  const payload = verifyToken(token);
  if (payload) {
    req.userPayload = payload;
  }
  next();
}

// Middleware: Strictly Require Authenticated User (Zero Fallback)
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.userPayload) {
    return res.status(401).json({
      error: 'Authentication required. Your session has expired or is invalid. Please sign in again.',
    });
  }
  next();
}

// Middleware: Strictly Require Specific Role(s) via Cryptographic Token (Zero Fallback)
export function requireRole(allowedRoles: Array<'admin' | 'manager' | 'cashier'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userPayload || !req.userPayload.role) {
      return res.status(401).json({
        error: 'Authentication required. Valid cryptographic session token is missing.',
      });
    }

    const userRole = req.userPayload.role;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: `Permission denied. Your role (${userRole}) is not authorized for this action. Required: ${allowedRoles.join(' or ')}.`,
      });
    }

    next();
  };
}
