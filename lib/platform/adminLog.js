// Server-side only: every admin decision on the store is written down (PLATFORM_SPEC section 20).
import { rest } from '../supabase';

export async function logAdmin(actor, action, target, details = null) {
  try {
    await rest('admin_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ actor: String(actor).toLowerCase(), action, target: target ? String(target) : null, details }),
    });
  } catch (err) {
    // the decision itself already happened; a missing log line must not undo it, but must be visible
    console.error('admin log write failed:', action, target, err.message);
  }
}

export async function recentAdminLog(limit = 50) {
  return rest(`admin_log?select=*&order=id.desc&limit=${limit}`);
}
