/**
 * GET /api/login
 * Redirects the user to Google's OAuth 2.0 consent screen.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID   — OAuth 2.0 client ID
 *   ALLOWED_DOMAIN     — e.g. bazaar.com  (restricts Google's hosted-domain selector)
 */
import { isLocalhost } from './_auth.js';

export default function handler(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).send('GOOGLE_CLIENT_ID env var is not set.');
  }

  const host = req.headers.host || '';
  const proto = isLocalhost(req) ? 'http' : 'https';
  const redirectUri = `${proto}://${host}/api/auth`;
  const domain = process.env.ALLOWED_DOMAIN || '';

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    prompt:        'select_account',
    ...(domain ? { hd: domain } : {}),   // hint Google to show only org accounts
  });

  return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
