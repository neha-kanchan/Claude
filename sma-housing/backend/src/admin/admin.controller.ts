import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { DataService } from '../data/data.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { SeedService } from '../seed/seed.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOnly } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../common/permissions';

@ApiTags('admin')
@Controller()
export class AdminController {
  constructor(
    private readonly data: DataService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly seed: SeedService,
    private readonly prisma: PrismaService
  ) {}

  @Post('users/:id/password')
  @AdminOnly()
  @HttpCode(204)
  @ApiOperation({ summary: "Set a user's username and password" })
  async setPassword(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { username?: string; password?: string }) {
    if (!body?.password || body.password.length < 6) throw new BadRequestException('Password must be at least 6 characters');
    await this.auth.setCredentials(id, body.username, body.password);
    await this.audit.record(user, 'ADMIN', 'users', id, 'Credentials updated');
  }

  @Get('admin/backup')
  @AdminOnly()
  @ApiOperation({ summary: 'Full JSON dump of the database' })
  async backup(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    const dump = {
      exportedAt: new Date().toISOString(),
      db: this.prisma.engine,
      data: await this.data.dump()
    };
    await this.audit.record(user, 'BACKUP', 'database', '—', 'Full JSON backup downloaded');
    res.setHeader('Content-Disposition', `attachment; filename="sma-housing-backup-${Date.now()}.json"`);
    res.json(dump);
  }

  @Post('admin/reset-demo')
  @AdminOnly()
  @ApiOperation({ summary: 'Wipe the database and reseed roles and users' })
  async reset(@CurrentUser() user: AuthUser) {
    await this.data.wipe();
    await this.seed.seedIdentities();
    await this.audit.record(user, 'RESET', 'database', '—', 'Database reset to a fresh install');
    return { ok: true };
  }
}
