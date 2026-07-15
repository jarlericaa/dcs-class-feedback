import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { config } from "@class-feedback/config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Class Feedback API")
    .setDescription("API for class feedback and Q&A platform")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = config.API_PORT;
  await app.listen(port);
  console.log(`API listening on port ${port}`);
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap application:", error);
  process.exit(1);
});
