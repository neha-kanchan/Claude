import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({ origin: true, credentials: true });
  app.useBodyParser('json', { limit: '25mb' });          // photos and documents travel as data URLs
  app.setGlobalPrefix('api', { exclude: [''] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));

  const swagger = new DocumentBuilder()
    .setTitle('SMA Housing System API')
    .setDescription('Student housing management: residents, roll call, movements, cases, documents and the audit trail.')
    .setVersion('3.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);

  const engine = app.get(PrismaService).engine;
  new Logger('Bootstrap').log(`SMA Housing System (${engine}) on http://localhost:${port} — API docs at /api/docs`);
}

bootstrap();
