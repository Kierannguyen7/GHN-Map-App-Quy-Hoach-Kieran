const SESSION_COOKIE = 'dcl_session';
const SESSION_TTL_MS = 10 * 60 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN = 5;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/auth/')) return json({ error: 'not_found' }, 404);
    if (!env.DB) return json({ error: 'missing_d1_binding' }, 500);

    try {
      if (url.pathname === '/api/auth/login' && request.method === 'POST') return login(request, env);
      if (url.pathname === '/api/auth/session' && request.method === 'GET') return session(request, env);
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') return logout(request, env);
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      return json({ error: 'server_error', message: error.message }, 500);
    }
  },
};

async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return json({ error: 'missing_credentials' }, 400);

  const user = await env.DB.prepare('SELECT * FROM users WHERE lower(username)=lower(?) LIMIT 1').bind(username).first();
  const now = Date.now();
  if (!user || user.status === 'locked' || Number(user.locked_until || 0) > now) {
    await audit(env, user?.id || null, 'LOGIN_DENIED', 'user', user?.id || username, null, { reason: 'locked_or_missing' });
    return json({ error: 'invalid_credentials' }, 401);
  }

  const ok = await verifyPassword(password, user.password_hash, user.password_algo);
  if (!ok) {
    const failed = Number(user.failed_login_count || 0) + 1;
    const lockedUntil = failed >= MAX_FAILED_LOGIN ? now + LOGIN_LOCK_MS : null;
    await env.DB.prepare('UPDATE users SET failed_login_count=?, locked_until=?, updated_at=? WHERE id=?')
      .bind(failed, lockedUntil, now, user.id).run();
    await audit(env, user.id, 'LOGIN_FAILED', 'user', user.id, null, { failed_login_count: failed, locked_until: lockedUntil });
    return json({ error: 'invalid_credentials' }, 401);
  }

  const sessionId = crypto.randomUUID();
  const expiresAt = now + SESSION_TTL_MS;
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET failed_login_count=0, locked_until=NULL, last_login_at=?, updated_at=? WHERE id=?').bind(now, now, user.id),
    env.DB.prepare('INSERT INTO sessions (id,user_id,expires_at,created_at,last_seen_at,user_agent,ip_hash) VALUES (?,?,?,?,?,?,?)')
      .bind(sessionId, user.id, expiresAt, now, now, request.headers.get('user-agent') || '', await ipHash(request, env)),
  ]);
  await audit(env, user.id, 'LOGIN_SUCCESS', 'session', sessionId, null, { role: user.role });

  return json({
    user: safeUser(user),
    forcePasswordChange: !!user.force_password_change || user.status === 'password_reset_required',
  }, 200, {
    'Set-Cookie': cookie(sessionId, expiresAt),
  });
}

async function session(request, env) {
  const current = await currentSession(request, env);
  if (!current) return json({ authenticated: false }, 401);
  return json({ authenticated: true, user: safeUser(current.user) });
}

async function logout(request, env) {
  const id = readCookie(request, SESSION_COOKIE);
  if (id) {
    await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').bind(Date.now(), id).run();
  }
  return json({ ok: true }, 200, {
    'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  });
}

async function currentSession(request, env) {
  const id = readCookie(request, SESSION_COOKIE);
  if (!id) return null;
  const row = await env.DB.prepare(
    `SELECT s.id session_id, s.expires_at, s.revoked_at,
            u.id, u.username, u.full_name, u.role, u.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
      LIMIT 1`
  ).bind(id).first();
  if (!row || row.revoked_at || Number(row.expires_at || 0) <= Date.now() || row.status !== 'active') return null;
  await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE id=?').bind(Date.now(), id).run();
  return { sessionId: row.session_id, user: row };
}

async function verifyPassword(password, hash, algo) {
  if (String(algo || '').toLowerCase() === 'argon2id' || String(hash || '').startsWith('$argon2')) {
    throw new Error('argon2id_verifier_required_in_worker_build');
  }
  if (String(algo || '').toLowerCase() === 'bcrypt' || String(hash || '').startsWith('$2')) {
    throw new Error('bcrypt_verifier_required_in_worker_build');
  }
  return false;
}

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    status: user.status,
  };
}

async function audit(env, userId, action, objectType, objectId, beforeData, afterData) {
  await env.DB.prepare(
    'INSERT INTO audit_log (id,user_id,action,object_type,object_id,before_data,after_data,created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(
    crypto.randomUUID(),
    userId,
    action,
    objectType,
    objectId,
    beforeData ? JSON.stringify(beforeData) : null,
    afterData ? JSON.stringify(afterData) : null,
    Date.now()
  ).run();
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function cookie(value, expiresAt) {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${new Date(expiresAt).toUTCString()}`;
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return '';
}

async function ipHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  const salt = env.AUDIT_IP_SALT || 'dcl';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
