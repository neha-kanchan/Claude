import { Body, Controller, Get, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { SeedService } from '../seed/seed.service';
import { Authenticated } from './permissions.decorator';
import { CurrentUser } from './current-user.decorator';
import { AuthUser } from '../common/permissions';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly seed: SeedService
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Sign in with a username and password' })
  @ApiBody({ schema: { properties: { username: { type: 'string', example: 'amal' }, password: { type: 'string', example: 'admin123' } } } })
  async login(@Body() body: { username?: string; password?: string }) {
    if (this.auth.mode !== 'local') {
      throw new UnauthorizedException('Server is in Entra SSO mode; sign in with Microsoft and send the bearer token.');
    }
    await this.seed.seedIdentities();
    const result = await this.auth.login(body?.username || '', body?.password || '');
    if (!result) {
      await this.audit.record(String(body?.username || ''), 'LOGIN', 'session', '', 'Failed sign-in attempt');
      throw new UnauthorizedException('Invalid username or password');
    }
    await this.audit.record(result.user as unknown as AuthUser, 'LOGIN', 'session', result.user.id, 'Signed in');
    return result;
  }

  @Get('me')
  @Authenticated()
  @ApiOperation({ summary: 'The signed-in user' })
  me(@CurrentUser() user: AuthUser) {
    return { id: user.id, name: user.name, username: user.username, role: user.role };
  }
}
