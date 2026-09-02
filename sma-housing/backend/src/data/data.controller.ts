import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { DataService } from './data.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { Authenticated } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser, canRead, canWrite } from '../common/permissions';
import { COLLECTIONS, isCollection } from '../common/collections';

const rid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

/**
 * The collection API. Read and write permission is decided per collection at
 * request time (the collection is a path parameter), so these routes check
 * canRead/canWrite rather than carrying a fixed @RequirePermission.
 */
@ApiTags('data')
@Controller()
export class DataController {
  constructor(
    private readonly data: DataService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness, database engine and auth mode' })
  async health() {
    await this.prisma.$queryRaw`select 1`;
    return { ok: true, db: this.prisma.engine, authMode: this.auth.mode };
  }

  @Get('bootstrap')
  @Authenticated()
  @ApiOperation({ summary: 'Every collection the UI needs, in one call' })
  async bootstrap(@CurrentUser() user: AuthUser) {
    const out: Record<string, any> = {};
    for (const [name, spec] of Object.entries(COLLECTIONS)) {
      if (!canRead(user, name)) { out[name] = spec.dict || spec.object ? {} : []; continue; }
      out[name] = await this.data.list(name);
    }
    out._meta = {
      db: this.prisma.engine,
      authMode: this.auth.mode,
      serverTime: new Date().toISOString(),
      user: { id: user.id, name: user.name, role: user.role }
    };
    return out;
  }

  @Put('sync/:collection')
  @Authenticated()
  @ApiOperation({ summary: 'Batch upsert + delete for one collection, diffed and audited server-side' })
  @ApiParam({ name: 'collection', example: 'students' })
  async sync(@CurrentUser() user: AuthUser, @Param('collection') collection: string, @Body() body: any) {
    if (!isCollection(collection) || collection === 'audit') throw new NotFoundException('Unknown collection');
    if (!canWrite(user, collection)) throw new ForbiddenException(`Your role cannot modify ${collection}`);

    const changes = await this.data.sync(collection, body);
    const entity = COLLECTIONS[collection].page;
    if (collection !== 'settings' && collection !== 'notifications') {
      for (const id of changes.created) await this.audit.record(user, 'CREATE', entity, id, `Created ${collection} record`);
      for (const id of changes.updated) await this.audit.record(user, 'UPDATE', entity, id, `Updated ${collection} record`);
      for (const id of changes.deleted) await this.audit.record(user, 'DELETE', entity, id, `Deleted ${collection} record`);
    }
    return changes;
  }

  @Post('audit')
  @Authenticated()
  @HttpCode(204)
  @ApiOperation({ summary: 'Record a client-side action (exports, workflow steps, sign-out)' })
  async logAction(@CurrentUser() user: AuthUser, @Body() body: { action?: string; entity?: string; entityId?: string; details?: string }) {
    await this.audit.record(
      user,
      String(body?.action || 'ACTION').slice(0, 24),
      String(body?.entity || '').slice(0, 40),
      String(body?.entityId || '').slice(0, 60),
      String(body?.details || '').slice(0, 500)
    );
  }

  @Get(':collection')
  @Authenticated()
  @ApiOperation({ summary: 'List a collection; any field can be used as a query filter' })
  @ApiParam({ name: 'collection', example: 'students' })
  async list(@CurrentUser() user: AuthUser, @Param('collection') collection: string, @Query() query: Record<string, string>) {
    if (!isCollection(collection)) throw new NotFoundException('Unknown collection');
    if (!canRead(user, collection)) throw new ForbiddenException('Forbidden');
    let rows = await this.data.list(collection);
    if (Array.isArray(rows)) {
      for (const [k, v] of Object.entries(query)) rows = rows.filter((x: any) => String(x[k]) === String(v));
    }
    return rows;
  }

  @Get(':collection/:id')
  @Authenticated()
  @ApiOperation({ summary: 'One record' })
  async findOne(@CurrentUser() user: AuthUser, @Param('collection') collection: string, @Param('id') id: string) {
    if (!isCollection(collection) || COLLECTIONS[collection].object) throw new NotFoundException('Unknown collection');
    if (!canRead(user, collection)) throw new ForbiddenException('Forbidden');
    const row = await this.data.findOne(collection, id);
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  @Post(':collection')
  @Authenticated()
  @ApiOperation({ summary: 'Create a record (an id is generated when you omit one)' })
  async create(@CurrentUser() user: AuthUser, @Param('collection') collection: string, @Body() body: Record<string, any>) {
    this.assertWritable(user, collection);
    const record = { ...body };
    if (!record.id) record.id = rid(collection.slice(0, 3).toUpperCase());
    const { created } = await this.data.upsert(collection, record);
    await this.audit.record(user, created ? 'CREATE' : 'UPDATE', COLLECTIONS[collection].page, record.id, 'Via REST API');
    return this.data.findOne(collection, record.id);
  }

  @Put(':collection/:id')
  @Authenticated()
  @ApiOperation({ summary: 'Update a record (merged into the existing one)' })
  async update(@CurrentUser() user: AuthUser, @Param('collection') collection: string, @Param('id') id: string, @Body() body: Record<string, any>) {
    this.assertWritable(user, collection);
    const existing = await this.data.findOne(collection, id);
    if (!existing) throw new NotFoundException('Not found');
    await this.data.upsert(collection, { ...existing, ...body, id });
    await this.audit.record(user, 'UPDATE', COLLECTIONS[collection].page, id, 'Via REST API');
    return this.data.findOne(collection, id);
  }

  @Delete(':collection/:id')
  @Authenticated()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a record' })
  async remove(@CurrentUser() user: AuthUser, @Param('collection') collection: string, @Param('id') id: string) {
    this.assertWritable(user, collection);
    await this.data.remove(collection, id);
    await this.audit.record(user, 'DELETE', COLLECTIONS[collection].page, id, 'Via REST API');
  }

  private assertWritable(user: AuthUser, collection: string): void {
    if (!isCollection(collection) || collection === 'audit' || COLLECTIONS[collection].object) {
      throw new NotFoundException('Unknown collection');
    }
    if (!canWrite(user, collection)) throw new ForbiddenException('Forbidden');
  }
}
