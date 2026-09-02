// Authentication.
// AUTH_MODE=local -> username/password against the users table; session is a signed JWT (jose).
// AUTH_MODE=entra -> verifies Microsoft Entra ID bearer tokens (same approach as the sample app);
//                    auto-provisions a user on first sign-in, mapping Entra app roles to app roles.
// Attaches req.user = { id, name, username, role (role name), perms, isAdmin }.

import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { getUserByUsername, getRoleByName, getOne, upsertOne, query } from './db2.js';

const MODE = (process.env.AUTH_MODE || 'local').toLowerCase();
const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET || 'dev-secret-change-me');
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);

const tenantId = process.env.ENTRA_TENANT_ID || '';
const apiAudience = process.env.ENTRA_API_AUDIENCE || process.env.ENTRA_CLIENT_ID || '';
const roleMap = { 'Housing.Admin': 'Administrator', 'Housing.Staff': 'Housing Supervisor', 'Housing.Security': 'Security Officer', 'Housing.ReadOnly': 'Viewer' };
const jwks = tenantId ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)) : null;

export function authMode() { return MODE; }

export async function login(env, username, password) {
  const user = await getUserByUsername(env, String(username || '').toLowerCase());
  if (!user || !user.passwordHash || !bcrypt.compareSync(String(password || ''), user.passwordHash)) return null;
  const token = await new SignJWT({ uid: user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(SECRET);
  return { token, user: { id: user.id, name: user.name, username: user.username, role: user.role } };
}

export async function setPassword(env, userId, password) {
  await query('update "users" set "password_hash" = $1 where "env" = $2 and "id" = $3', [bcrypt.hashSync(password, 10), env, userId]);
}

export async function setUsername(env, userId, username) {
  await query('update "users" set "username" = $1 where "env" = $2 and "id" = $3', [String(username).toLowerCase(), env, userId]);
}

/* Short-lived, read-only ticket for file bodies.
   <img src> and <a download> cannot send an Authorization header, so the browser
   gets a signed ticket instead of the session token: it is scoped to one
   environment, carries no write authority, and expires in minutes. */
const VIEW_TTL_MINUTES = Number(process.env.FILE_VIEW_TTL_MINUTES || 10);

export async function mintViewToken(env, userId) {
  return new SignJWT({ uid: userId, env, scope: 'files:read' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${VIEW_TTL_MINUTES}m`)
    .sign(SECRET);
}

export function viewTokenTtlSeconds() { return VIEW_TTL_MINUTES * 60; }

export async function verifyViewToken(token) {
  const { payload } = await jwtVerify(token, SECRET);
  if (payload.scope !== 'files:read') throw new Error('Not a file ticket');
  if (!payload.env) throw new Error('Ticket names no environment');
  return payload;   // payload.env is the environment the ticket may read
}

export function requireAuth() {
  return async (req, res, next) => {
    try {
      const env = req.env;
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) return res.status(401).json({ error: 'Missing bearer token' });

      let user;
      if (MODE === 'entra') {
        if (!jwks || !apiAudience) return res.status(500).json({ error: 'Entra SSO is not configured (ENTRA_TENANT_ID / ENTRA_API_AUDIENCE)' });
        const { payload } = await jwtVerify(token, jwks, {
          issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
          audience: apiAudience
        });
        user = await provisionEntraUser(env, payload);
      } else {
        const { payload } = await jwtVerify(token, SECRET);
        // Sessions work across prod/test: the user is resolved in the requested environment.
        user = await getOne(env, 'users', payload.uid);
        if (!user || !user.active) return res.status(401).json({ error: 'User is inactive or removed' });
      }

      const role = await getRoleByName(env, user.role);
      req.user = {
        id: user.id, name: user.name, username: user.username || user.id, role: user.role,
        perms: role ? role.perms : {}, isAdmin: role ? role.perms === 'ALL' : false
      };
      next();
    } catch (err) {
      res.status(401).json({ error: err.message || 'Invalid token' });
    }
  };
}

async function provisionEntraUser(env, payload) {
  const oid = payload.oid || payload.sub;
  const { rows } = await query('select "id" from "users" where "env" = $1 and "entra_oid" = $2', [env, oid]);
  const roles = payload.roles || [];
  const roleName = roles.map((r) => roleMap[r]).find(Boolean) || 'Viewer';
  const name = payload.name || payload.preferred_username || 'Entra user';
  const username = (payload.preferred_username || oid).toLowerCase();
  const id = rows[0]?.id || `USR-${String(oid).slice(0, 8)}`;
  await upsertOne(env, 'users', { id, name, email: payload.preferred_username || '', role: roleName, active: 1, username, entraOid: oid }, { keepSecrets: true });
  return { id, name, email: payload.preferred_username || '', role: roleName, active: 1, username };
}
