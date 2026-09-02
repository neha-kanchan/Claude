import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, AuthedRequest } from './auth.guard';
import { can } from '../common/permissions';

const PERMISSION_KEY = 'permission';
const ADMIN_KEY = 'adminOnly';

/** Guard behind @RequirePermission and @AdminOnly. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, targets)) {
      if (!req.user?.isAdmin) throw new ForbiddenException('Administrator only');
      return true;
    }

    const required = this.reflector.getAllAndOverride<[string, string?]>(PERMISSION_KEY, targets);
    if (!required) return true;
    const [page, action] = required;
    if (!can(req.user, page, action)) {
      throw new ForbiddenException(action ? `Your role cannot ${action} on ${page}` : `Your role cannot open ${page}`);
    }
    return true;
  }
}

/** Route needs this page (and optionally this action) in the caller's role. */
export const RequirePermission = (page: string, action?: string) =>
  applyDecorators(SetMetadata(PERMISSION_KEY, [page, action]), UseGuards(AuthGuard, PermissionsGuard));

/** Route is for administrators only. */
export const AdminOnly = () =>
  applyDecorators(SetMetadata(ADMIN_KEY, true), UseGuards(AuthGuard, PermissionsGuard));

/** Route needs a signed-in user, whatever their role. */
export const Authenticated = () => applyDecorators(UseGuards(AuthGuard));
