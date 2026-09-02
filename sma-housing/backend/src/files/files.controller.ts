import { Controller, ForbiddenException, Get, InternalServerErrorException, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { DataService } from '../data/data.service';
import { Authenticated } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser, canRead } from '../common/permissions';

/**
 * File bodies (student photos, agreements, evidence). Stored as data URLs
 * today; moving to object storage means changing only this controller and the
 * StoredFile model.
 */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly data: DataService) {}

  @Get(':id/download')
  @Authenticated()
  @ApiOperation({ summary: 'Download a stored file by key' })
  @ApiParam({ name: 'id', example: 'FILE-3KD9Q' })
  async download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response): Promise<void> {
    if (!canRead(user, 'files')) throw new ForbiddenException('Forbidden');
    const file = await this.data.findOne('files', id);
    if (!file || !file.data) throw new NotFoundException('File not found');

    const match = /^data:([^;]+);base64,(.+)$/.exec(file.data);
    if (!match) throw new InternalServerErrorException('Stored file is not base64 data');

    res.setHeader('Content-Type', file.mime || match[1] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${String(file.name || 'file').replace(/"/g, '')}"`);
    res.send(Buffer.from(match[2], 'base64'));
  }
}
