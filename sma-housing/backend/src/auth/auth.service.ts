import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/permissions';

const ENTRA_ROLE_MAP: Record<string, string> = {
  'Housing.Admin': 'Administrator',
  'Housing.Staff': 'Housing Supervisor',
  'Housing.Security': 'Security Officer',
  'Housing.ReadOnly': 'Viewer'
};

@Injectable()
export class AuthService {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  get mode(): string {
    return (this.config.get<string>('AUTH_MODE') || 'local').toLowerCase();
  }

  /** Sign in with a username and password. Returns null when they do not match. */
  async login(username: string, password: string): Promise<{ token: string; user: Omit<AuthUser, 'perms'> } | null> {
    const user = await this.prisma.user.findFirst({
      where: { username: String(username || '').toLowerCase(), active: true }
    });
    if (!user || !user.passwordHash) return null;
    if (!bcrypt.compareSync(String(password || ''), user.passwordHash)) return null;

    const hours = Number(this.config.get('SESSION_HOURS') || 12);
    const token = await this.jwt.signAsync({ uid: user.id, name: user.name, role: user.role }, { expiresIn: `${hours}h` });
    return {
      token,
      user: { id: user.id, name: user.name, username: user.username || user.id, role: user.role, isAdmin: user.role === 'Administrator' }
    };
  }

  /** Resolve a bearer token to the user plus the permissions of their role. */
  async verify(token: string): Promise<AuthUser> {
    const id = this.mode === 'entra' ? await this.verifyEntra(token) : await this.verifyLocal(token);
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.active) throw new UnauthorizedException('User is inactive or removed');

    const role = await this.prisma.role.findFirst({ where: { name: user.role } });
    let perms: AuthUser['perms'] = {};
    if (role) {
      if (role.perms === 'ALL') perms = 'ALL';
      else { try { perms = JSON.parse(role.perms); } catch { perms = {}; } }
    }
    return {
      id: user.id, name: user.name, username: user.username || user.id, role: user.role,
      perms, isAdmin: perms === 'ALL'
    };
  }

  private async verifyLocal(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<{ uid: string }>(token);
      return payload.uid;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /** Microsoft Entra ID bearer tokens, with the user provisioned on first sign-in. */
  private async verifyEntra(token: string): Promise<string> {
    const tenantId = this.config.get<string>('ENTRA_TENANT_ID') || '';
    const audience = this.config.get<string>('ENTRA_API_AUDIENCE') || this.config.get<string>('ENTRA_CLIENT_ID') || '';
    if (!tenantId || !audience) throw new UnauthorizedException('Entra SSO is not configured');
    if (!this.jwks) this.jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));

    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      audience
    });
    const oid = String(payload.oid || payload.sub);
    const existing = await this.prisma.user.findFirst({ where: { entraOid: oid } });
    if (existing) return existing.id;

    const roles = (payload.roles as string[]) || [];
    const roleName = roles.map((r) => ENTRA_ROLE_MAP[r]).find(Boolean) || 'Viewer';
    const created = await this.prisma.user.create({
      data: {
        id: `USR-${oid.slice(0, 8)}`,
        name: String(payload.name || payload.preferred_username || 'Entra user'),
        email: String(payload.preferred_username || ''),
        role: roleName,
        active: true,
        username: String(payload.preferred_username || oid).toLowerCase(),
        entraOid: oid
      }
    });
    return created.id;
  }

  async setCredentials(userId: string, username: string | undefined, password: string): Promise<void> {
    const data: { username?: string; passwordHash: string } = { passwordHash: bcrypt.hashSync(password, 10) };
    if (username) data.username = username.toLowerCase();
    await this.prisma.user.update({ where: { id: userId }, data });
  }
}
