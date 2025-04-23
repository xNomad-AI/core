// src/message/message.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MessageController } from './chat.controller.js';
import { MessageService } from './chat.service.js';
import { ApiKeyModule } from '../api-keys/api-key.module.js';

@Module({
  imports: [HttpModule, ApiKeyModule],
  controllers: [MessageController],     
  providers: [MessageService],
})
export class MessageModule {}   