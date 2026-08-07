/**
 * Private auth helper — NOT a Vercel route (underscore prefix).
 * Shared by login, auth callback, query, me, logout.
 */
import crypto from 'node:crypto';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function createToken(email, secret) {
  const payload = { email, exp: Date.now() + SESSION_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token, secret) {
  try {
    const dot = token.indexOf('.');
    if (dot === -1) return null;
    const data = token.slice(0, dot);
    const sig  = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    // constant-time compare
    const eBuf = Buffer.from(expected);
    const sBuf = Buffer.from(sig);
    if (eBuf.length !== sBuf.length || !crypto.timingSafeEqual(eBuf, sBuf)) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getUser(req) {
  const cookieHeader = req.headers.cookie || '';
  const authCookie = cookieHeader.split(';').find(c => c.trim().startsWith('auth='));
  if (!authCookie) return null;
  const token = authCookie.trim().slice(5);
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return verifyToken(token, secret);
}

export function cookieString(token, isSecure) {
  const sec = isSecure ? '; Secure' : '';
  return `auth=${token}; HttpOnly${sec}; Path=/; Max-Age=28800; SameSite=Lax`;
}

export function clearCookieString(isSecure) {
  const sec = isSecure ? '; Secure' : '';
  return `auth=; HttpOnly${sec}; Path=/; Max-Age=0; SameSite=Lax`;
}

export function isLocalhost(req) {
  const h = req.headers.host || '';
  return h.startsWith('localhost') || h.startsWith('127.');
}
