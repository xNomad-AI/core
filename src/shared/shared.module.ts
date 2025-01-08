import { Global, Module } from '@nestjs/common';
import { TransientLoggerService } from './transient-logger.service.js';
import { PhalaService } from './phala.service.js';

@Global()
@Module({
  imports: [],
  providers: [TransientLoggerService, PhalaService],
  exports: [TransientLoggerService, PhalaService],
})
export class SharedModule {}
