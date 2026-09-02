/**
 * Serves the built React frontend (../frontend/dist) alongside the API, so one
 * process runs the whole app in production. In development the Vite dev server
 * serves the UI instead and proxies /api here.
 */

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const clientDir = join(__dirname, '..', '..', '..', 'frontend', 'dist');
const indexFile = join(clientDir, 'index.html');

@Module({})
export class ServeStaticModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        express.static(clientDir),
        (req: Request, res: Response, next: NextFunction) => {
          if (req.path.startsWith('/api')) return next();
          if (!existsSync(indexFile)) {
            return res.status(503).send('Frontend has not been built yet - run "npm run build" in the frontend folder.');
          }
          return res.sendFile(indexFile);
        }
      )
      .forRoutes('*');
  }
}
