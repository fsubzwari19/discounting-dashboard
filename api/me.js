/**
 * GET /api/me
 * Returns { email } for the currently authenticated user, or 401.
 * Used by index.html to verify the session on page load.
 */
import { getUser } from './_auth.js';

export default function handler(req, res) {
  const user = getUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.status(200).json({ email: user.email });
}
