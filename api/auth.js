/**
 * GET /api/auth
 * Google OAuth 2.0 callback handler.
 * Exchanges the auth code for an access token, fetches the user's email,
 * enforces the ALLOWED_DOMAIN restriction, then sets a signed HttpOnly cookie.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   SESSION_SECRET      — random string (≥32 chars) for HMAC signing
 *   ALLOWED_DOMAIN      — e.g. bazaar.com
 */
import { createToken, cookieString, isLocalhost } from './_auth.js';

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(302, `/login.html?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.redirect(302, '/login.html?error=no_code');
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.SESSION_SECRET) {
    return res.status(500).send('Server is missing required environment variables.');
  }

  const host = req.headers.host || '';
  const proto = isLocalhost(req) ? 'http' : 'https';
  const redirectUri = `${proto}://${host}/api/auth`;

  try {
    // 1. Exchange code → access_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', await tokenRes.text());
      return res.redirect(302, '/login.html?error=token_exchange');
    }

    const { access_token } = await tokenRes.json();

    // 2. Fetch user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userRes.ok) {
      return res.redirect(302, '/login.html?error=userinfo');
    }

    const { email } = await userRes.json();

    // 3. Enforce domain restriction
    const allowedDomain = process.env.ALLOWED_DOMAIN;
    if (allowedDomain && !email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
      return res.redirect(
        302,
        `/login.html?error=unauthorized&domain=${encodeURIComponent(allowedDomain)}`
      );
    }

    // 4. Create signed session token and set cookie
    const token = createToken(email, process.env.SESSION_SECRET);
    res.setHeader('Set-Cookie', cookieString(token, !isLocalhost(req)));
    return res.redirect(302, '/');

  } catch (err) {
    console.error('Auth callback error:', err);
    return res.redirect(302, '/login.html?error=server');
  }
}
