import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CoursesModule } from "./courses/courses.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [HealthModule, AuthModule, CoursesModule],
})
export class AppModule {}
