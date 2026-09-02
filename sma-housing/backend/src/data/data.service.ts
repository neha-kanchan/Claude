import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { COLLECTIONS, CollectionSpec } from '../common/collections';

export interface SyncChanges {
  created: string[];
  updated: string[];
  deleted: string[];
}

/**
 * One service for every collection. Records travel to the client in the shape
 * the UI uses: JSON columns parsed, nulls flattened to empty strings, secrets
 * dropped, `files` as a dictionary and `settings` as a single object.
 */
@Injectable()
export class DataService {
  constructor(private readonly prisma: PrismaService) {}

  private spec(collection: string): CollectionSpec {
    const spec = COLLECTIONS[collection];
    if (!spec) throw new NotFoundException('Unknown collection');
    return spec;
  }

  /** DB row -> API record. */
  private toApi(spec: CollectionSpec, row: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      if (spec.secret?.includes(key)) continue;
      if (spec.json?.includes(key)) {
        if (typeof value === 'string' && value) {
          try { out[key] = JSON.parse(value); } catch { out[key] = value; }   // roles.perms may be "ALL"
        } else {
          out[key] = value ?? null;
        }
        continue;
      }
      out[key] = value === null || value === undefined ? (typeof value === 'boolean' ? value : '') : value;
    }
    return out;
  }

  /** API record -> DB row, dropping fields the model does not have. */
  private toRow(spec: CollectionSpec, record: Record<string, any>): Record<string, any> {
    const fields = this.fieldsOf(spec);
    const row: Record<string, any> = {};
    for (const field of fields) {
      if (!(field.name in record)) continue;
      if (spec.secret?.includes(field.name) && record[field.name] === undefined) continue;
      let value = record[field.name];
      if (spec.json?.includes(field.name)) {
        row[field.name] = typeof value === 'string' ? value : JSON.stringify(value ?? null);
        continue;
      }
      if (field.type === 'Boolean') { row[field.name] = value === true || value === 1 || value === '1'; continue; }
      if (field.type === 'Int') {
        if (value === '' || value === null || value === undefined) { row[field.name] = field.required ? 0 : null; continue; }
        row[field.name] = Number(value);
        continue;
      }
      if (value === undefined || value === null) { row[field.name] = field.required ? '' : null; continue; }
      row[field.name] = String(value);
    }
    return row;
  }

  /** Field metadata straight from the generated Prisma client. */
  private fieldsOf(spec: CollectionSpec): { name: string; type: string; required: boolean }[] {
    const dmmf: any = (this.prisma as any)._runtimeDataModel ?? {};
    const model = dmmf.models?.[spec.model];
    if (!model) return [];
    return model.fields.map((f: any) => ({ name: f.name, type: f.type, required: f.isRequired && !f.hasDefaultValue }));
  }

  async list(collection: string): Promise<any> {
    const spec = this.spec(collection);
    if (spec.object) return this.getSettings();
    const rows = await this.prisma.delegate(spec.model).findMany();
    const list = rows.map((r: Record<string, any>) => this.toApi(spec, r));
    if (spec.dict) return Object.fromEntries(list.map((f: any) => [f.id, f]));
    return list;
  }

  async findOne(collection: string, id: string): Promise<any | null> {
    const spec = this.spec(collection);
    const row = await this.prisma.delegate(spec.model).findUnique({ where: { id } });
    return row ? this.toApi(spec, row) : null;
  }

  async upsert(collection: string, record: Record<string, any>): Promise<{ created: boolean }> {
    const spec = this.spec(collection);
    const row = this.toRow(spec, record);
    const delegate = this.prisma.delegate(spec.model);
    const existing = await delegate.findUnique({ where: { id: record.id } });
    if (existing) {
      const { id: _ignored, ...data } = row;
      await delegate.update({ where: { id: record.id }, data });
      return { created: false };
    }
    await delegate.create({ data: row });
    return { created: true };
  }

  async remove(collection: string, id: string): Promise<void> {
    const spec = this.spec(collection);
    await this.prisma.delegate(spec.model).delete({ where: { id } }).catch(() => undefined);
  }

  /* ---------------- settings: key/value exposed as one object ---------------- */

  async getSettings(): Promise<Record<string, any>> {
    const rows = await this.prisma.setting.findMany();
    const out: Record<string, any> = {};
    for (const r of rows) {
      try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
    }
    return out;
  }

  async putSettings(obj: Record<string, any>): Promise<void> {
    const current = await this.getSettings();
    for (const [key, value] of Object.entries(obj || {})) {
      const stored = JSON.stringify(value);
      await this.prisma.setting.upsert({ where: { key }, update: { value: stored }, create: { key, value: stored } });
    }
    for (const key of Object.keys(current)) {
      if (!(key in (obj || {}))) await this.prisma.setting.delete({ where: { key } }).catch(() => undefined);
    }
  }

  /**
   * Batch sync from the UI: the client sends a whole collection, the server
   * works out what changed. The caller audits each id we report back.
   */
  async sync(collection: string, payload: any): Promise<SyncChanges> {
    const spec = this.spec(collection);
    const changes: SyncChanges = { created: [], updated: [], deleted: [] };

    if (spec.object) {
      await this.putSettings(payload);
      return { ...changes, updated: ['settings'] };
    }

    const records: Record<string, any>[] = spec.dict
      ? Object.entries(payload || {}).map(([id, v]) => ({ ...(v as object), id }))
      : payload;
    if (!Array.isArray(records)) throw new NotFoundException('Expected an array');

    const currentRaw = await this.list(collection);
    const current: Record<string, any>[] = spec.dict ? Object.values(currentRaw) : currentRaw;
    const byId = Object.fromEntries(current.map((r) => [r.id, r]));
    const incoming = new Set(records.filter((r) => r && r.id).map((r) => r.id));

    for (const rec of records) {
      if (!rec || !rec.id) continue;
      if (!byId[rec.id]) {
        await this.upsert(collection, rec);
        changes.created.push(rec.id);
      } else if (JSON.stringify(this.normalize(spec, rec)) !== JSON.stringify(this.normalize(spec, byId[rec.id]))) {
        await this.upsert(collection, rec);
        changes.updated.push(rec.id);
      }
    }
    for (const id of Object.keys(byId)) {
      if (!incoming.has(id)) {
        await this.remove(collection, id);
        changes.deleted.push(id);
      }
    }
    return changes;
  }

  /** Comparable form of a record, so an unchanged row is not rewritten. */
  private normalize(spec: CollectionSpec, rec: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const field of this.fieldsOf(spec)) {
      if (spec.secret?.includes(field.name)) continue;
      let value = rec[field.name];
      if (spec.json?.includes(field.name)) {
        if (typeof value === 'string' && value && value !== 'ALL') {
          try { value = JSON.parse(value); } catch { /* keep the raw string */ }
        }
        out[field.name] = value ?? null;
        continue;
      }
      if (field.type === 'Boolean') { out[field.name] = value === true || value === 1 || value === '1'; continue; }
      if (field.type === 'Int') { out[field.name] = value === '' || value === null || value === undefined ? null : Number(value); continue; }
      out[field.name] = value === undefined || value === null ? '' : String(value);
    }
    return out;
  }

  /** Every collection at once - what the UI loads after sign-in. */
  async dump(): Promise<Record<string, any>> {
    const out: Record<string, any> = {};
    for (const name of Object.keys(COLLECTIONS)) out[name] = await this.list(name);
    return out;
  }

  async wipe(): Promise<void> {
    for (const spec of Object.values(COLLECTIONS)) {
      await this.prisma.delegate(spec.model).deleteMany();
    }
  }
}
