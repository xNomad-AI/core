// src/message/message.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ApiKeyModule } from '../api-keys/api-key.module.js';

@Module({
  imports: [HttpModule, ApiKeyModule],
  controllers: [ChatController],     
  providers: [ChatService],
})
export class ChatModule {}   