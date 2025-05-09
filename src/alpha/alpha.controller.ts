import { Controller, Get, Param, Query, Post, Body} from '@nestjs/common';
import { AlphaService } from './alpha.service.js';
import { TwitterKolDto } from './alpha.types.js';

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

  @Post('/twitter-kols/bulk-update')
  async bulkUpdateTwitterKols(@Body() data: TwitterKolDto[]) {
    return this.alphaService.bulkUpdatePnl(data);
  }
}