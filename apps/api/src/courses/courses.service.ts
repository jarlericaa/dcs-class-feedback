import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@class-feedback/database";
import type { CreateCourseSchema } from "@class-feedback/contracts";
import { z } from "zod";

@Injectable()
export class CoursesService {
  async createCourse(
    userId: string,
    data: z.infer<typeof CreateCourseSchema>
  ): Promise<{ id: string }> {
    const course = await prisma.course.create({
      data: {
        title: data.title,
        code: data.code,
        semester: data.semester,
        year: data.year,
        timezone: data.timezone || "UTC",
        memberships: {
          create: {
            userId,
            role: "instructor",
          },
        },
      },
    });

    return { id: course.id };
  }

  async listUserCourses(userId: string): Promise<Record<string, unknown>[]> {
    const memberships = await prisma.courseMembership.findMany({
      where: { userId },
      include: { course: true },
    });

    return memberships.map((m) => m.course) as Record<string, unknown>[];
  }

  async getCourse(courseId: string): Promise<Record<string, unknown>> {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException("Course not found");
    }

    return course as Record<string, unknown>;
  }
}
