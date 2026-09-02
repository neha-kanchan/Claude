import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/permissions';

const rid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

/** Every write, from the UI or the API, lands here. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    user: AuthUser | string | undefined,
    action: string,
    entity = '',
    entityId = '',
    details = ''
  ): Promise<void> {
    const isUser = typeof user === 'object' && user !== null;
    await this.prisma.auditEntry.create({
      data: {
        id: rid('AUD'),
        at: new Date().toISOString(),
        user: isUser ? (user as AuthUser).name : String(user || 'system'),
        role: isUser ? (user as AuthUser).role : '—',
        action,
        entity,
        entityId,
        details
      }
    });
  }
}
