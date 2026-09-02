import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from './static/serve-static.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { PermissionsGuard } from './auth/permissions.decorator';
import { DataService } from './data/data.service';
import { DataController } from './data/data.controller';
import { FilesController } from './files/files.controller';
import { AdminController } from './admin/admin.controller';
import { AuditService } from './audit/audit.service';
import { SeedService } from './seed/seed.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ServeStaticModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('SESSION_SECRET') || 'dev-secret-change-me',
        signOptions: { expiresIn: `${config.get('SESSION_HOURS') || 12}h` }
      })
    })
  ],
  controllers: [AuthController, AdminController, FilesController, DataController],
  providers: [AuthService, DataService, AuditService, SeedService, PermissionsGuard]
})
export class AppModule implements OnModuleInit {
  constructor(private readonly seed: SeedService) {}

  /** A fresh database gets its roles and users before the first request. */
  async onModuleInit(): Promise<void> {
    await this.seed.seedIdentities();
  }
}
