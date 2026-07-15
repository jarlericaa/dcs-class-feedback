import { Controller, Post, Get, Body, Param, Request } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse } from "@nestjs/swagger";
import { CoursesService } from "./courses.service";
import { CreateCourseSchema } from "@class-feedback/contracts";

@ApiTags("Courses")
@Controller("courses")
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  @Post()
  @ApiBearerAuth()
  @ApiCreatedResponse({ description: "Course created" })
  async createCourse(
    @Body() data: unknown,
    @Request() req: { user: { id: string } }
  ): Promise<{ id: string }> {
    const validated = CreateCourseSchema.parse(data);
    return this.coursesService.createCourse(req.user.id, validated);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOkResponse({ description: "List courses" })
  async listCourses(
    @Request() req: { user: { id: string } }
  ): Promise<{ courses: Record<string, unknown>[] }> {
    const courses = await this.coursesService.listUserCourses(req.user.id);
    return { courses };
  }

  @Get(":id")
  @ApiBearerAuth()
  @ApiOkResponse({ description: "Get course" })
  async getCourse(@Param("id") id: string): Promise<{ course: Record<string, unknown> }> {
    const course = await this.coursesService.getCourse(id);
    return { course };
  }
}
