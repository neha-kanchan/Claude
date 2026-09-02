import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthUser } from '../common/permissions';

export interface AuthedRequest extends Request {
  user: AuthUser;
}

/** Requires a valid bearer token and attaches the resolved user to the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Missing bearer token');
    req.user = await this.auth.verify(token);
    return true;
  }
}
