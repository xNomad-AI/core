import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import bodyParser from 'body-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { CORE_SERVER_PORT } from './static-settings.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  if (process.env.SWAGGER_ENABLE === 'true') {
    const config = new DocumentBuilder()
    .setTitle('My API')
    .setDescription('My API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
    // const document = SwaggerModule.createDocument(app, config);
    // SwaggerModule.setup('api/docs', app, document);
  }

  app.enableCors({
    origin: '*',
    methods: '*',
    allowedHeaders: '*',
    credentials: true,
  });
  app.use(bodyParser.json({ limit: '5mb' }));

  await app.listen(CORE_SERVER_PORT);
  console.log(`Application is running on: http://localhost:${CORE_SERVER_PORT}`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Application Main');
  logger.error(err);
});
