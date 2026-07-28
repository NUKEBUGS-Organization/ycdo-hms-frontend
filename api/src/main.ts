import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CapRover / nginx terminate TLS and forward X-Forwarded-* headers
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  app.enableCors({
    origin: corsOrigin
      ? corsOrigin.split(',').map((o) => o.trim())
      : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Docker/CapRover sets PORT=80; local default stays 3000
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
