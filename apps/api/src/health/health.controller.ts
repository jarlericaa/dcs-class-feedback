import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOkResponse } from "@nestjs/swagger";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOkResponse({ description: "Service is healthy" })
  check(): { status: string } {
    return { status: "ok" };
  }
}
