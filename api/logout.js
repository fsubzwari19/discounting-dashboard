/**
 * GET /api/logout
 * Clears the auth cookie and redirects to the login page.
 */
import { clearCookieString, isLocalhost } from './_auth.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', clearCookieString(!isLocalhost(req)));
  return res.redirect(302, '/login.html');
}
