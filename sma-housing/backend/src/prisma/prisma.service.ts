import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Which engine the schema is pointed at - reported by /api/health. */
  get engine(): string {
    const url = process.env.DATABASE_URL || '';
    if (url.startsWith('postgres')) return 'postgres';
    if (url.startsWith('file:') || url.endsWith('.db')) return 'sqlite';
    return 'unknown';
  }

  /**
   * Prisma delegate by model name, so one service can drive every collection
   * instead of eighteen near-identical ones.
   */
  delegate(model: string): any {
    const client = this as unknown as Record<string, unknown>;
    const key = model.charAt(0).toLowerCase() + model.slice(1);
    const d = client[key];
    if (!d) throw new Error(`Unknown Prisma model: ${model}`);
    return d;
  }
}
