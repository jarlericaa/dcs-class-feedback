import { Controller, Post, Body, Get, Request } from "@nestjs/common";
import { ApiTags, ApiOkResponse, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "./auth.service";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("callback")
  @ApiOkResponse({ description: "OAuth callback" })
  async handleOAuthCallback(
    @Body() data: { email: string; googleId: string; displayName: string; picture?: string }
  ): Promise<{ token: string }> {
    return this.authService.handleOAuthCallback(data);
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOkResponse({ description: "Get current user" })
  async getCurrentUser(
    @Request() req: { user: { email: string; displayName: string } }
  ): Promise<{ email: string; displayName: string }> {
    return { email: req.user.email, displayName: req.user.displayName };
  }
}
