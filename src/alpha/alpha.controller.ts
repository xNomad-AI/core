import { Controller, Get, Param, Query, Post, Body, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { AlphaService } from './alpha.service.js';
import { TwitterKolDto } from './alpha.types.js';
import { AuthGuard } from '../shared/auth/auth.guard.js';
import { CORE_ADMIN_API_KEY } from '../static-settings.js';

@Controller('/alpha')
export class AlphaController {
  constructor(private readonly alphaService: AlphaService) {}

  @Get('/twitter-kols')
  async findAllTwitterKols(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
  ) {
    return this.alphaService.findAll(+page, +limit, search);
  }

  @Get('/twitter-kols/:handle')
  async findTwitterKolByHandle(@Param('handle') handle: string) {
    return this.alphaService.findByHandle(handle);
  }

  @UseGuards(AuthGuard)
  @Post('/twitter-kols/bulk-update')
  async bulkUpdateTwitterKols(@Body() data: TwitterKolDto[], @Req() req) {
    const adminKey = req.headers['x-admin-api-key'];
    if (!adminKey || adminKey !== CORE_ADMIN_API_KEY) {
      throw new UnauthorizedException('Admin API key required');
    }
    return this.alphaService.bulkUpdatePnl(data);
  }
}