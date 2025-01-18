import { Module } from '@nestjs/common';
import { AddressService } from './address.service.js';
import { AddressController } from './address.controller.js';

@Module({
  imports: [],
  providers: [AddressService],
  controllers: [AddressController],
  exports: [AddressService],
})
export class AddressModule {}
