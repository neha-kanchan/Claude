import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { PAGE_ACTIONS } from '../common/collections';

/**
 * Identity seed: the four roles and the demo users, so sign-in works on a fresh
 * database. Business demo data is seeded by the UI on first sign-in and synced back.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  static defaultPerms(roleName: string): Record<string, { view: boolean; actions: Record<string, boolean> }> {
    const grant = (pages: string[], withActions: boolean) => {
      const perms: Record<string, { view: boolean; actions: Record<string, boolean> }> = {};
      for (const page of pages) {
        perms[page] = { view: true, actions: {} };
        if (withActions) for (const a of PAGE_ACTIONS[page] || []) perms[page].actions[a] = true;
      }
      return perms;
    };

    if (roleName === 'Housing Supervisor') {
      return grant(['dashboard', 'students', 'attendance', 'movements', 'violations', 'complaints', 'requests', 'documents', 'calendar', 'notifications', 'reports'], true);
    }
    if (roleName === 'Security Officer') {
      return { ...grant(['attendance', 'movements'], true), ...grant(['dashboard', 'students', 'notifications'], false) };
    }
    if (roleName === 'Viewer') {
      return grant(['dashboard', 'students', 'attendance', 'movements', 'violations', 'complaints', 'requests', 'reports', 'calendar'], false);
    }
    return {};
  }

  /** No-op once any user exists. */
  async seedIdentities(): Promise<boolean> {
    if (await this.prisma.user.count() > 0) return false;

    await this.prisma.role.createMany({
      data: [
        { id: 'ROLE-ADMIN', name: 'Administrator', desc: 'Full access to every page and action.', perms: 'ALL', system: true },
        { id: 'ROLE-SUP', name: 'Housing Supervisor', desc: 'Runs daily operations.', perms: JSON.stringify(SeedService.defaultPerms('Housing Supervisor')), system: false },
        { id: 'ROLE-SEC', name: 'Security Officer', desc: 'Gate entry/exit and roll call.', perms: JSON.stringify(SeedService.defaultPerms('Security Officer')), system: false },
        { id: 'ROLE-VIEW', name: 'Viewer', desc: 'Read-only access to dashboards and reports.', perms: JSON.stringify(SeedService.defaultPerms('Viewer')), system: false }
      ]
    });

    const hash = (p: string) => bcrypt.hashSync(p, 10);
    await this.prisma.user.createMany({
      data: [
        { id: 'USR-1', name: 'Amal Director', email: 'amal.director@sma.ac.ae', role: 'Administrator', active: true, username: 'amal', passwordHash: hash('admin123') },
        { id: 'USR-2', name: 'Sami Supervisor', email: 'sami.sup@sma.ac.ae', role: 'Housing Supervisor', active: true, username: 'sami', passwordHash: hash('demo123') },
        { id: 'USR-3', name: 'Ghada Gatekeeper', email: 'ghada.sec@sma.ac.ae', role: 'Security Officer', active: true, username: 'ghada', passwordHash: hash('demo123') },
        { id: 'USR-4', name: 'Vera Viewer', email: 'vera.view@sma.ac.ae', role: 'Viewer', active: true, username: 'vera', passwordHash: hash('demo123') }
      ]
    });

    await this.prisma.auditEntry.create({
      data: { id: 'AUD-SEED', at: new Date().toISOString(), user: 'system', role: '—', action: 'SEED', entity: 'database', entityId: '—', details: 'Identity seed (roles + users)' }
    });

    this.logger.log('Seeded roles and demo users - sign in as amal / admin123');
    return true;
  }
}
