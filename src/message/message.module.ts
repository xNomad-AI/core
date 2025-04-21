// src/message/message.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MessageController } from './message.controller.js';
import { MessageService } from './message.service.js';

@Module({
  imports: [HttpModule],
  controllers: [MessageController],     
  providers: [MessageService],
})
export class MessageModule {}   