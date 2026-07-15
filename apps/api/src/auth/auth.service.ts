import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { prisma } from "@class-feedback/database";

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async handleOAuthCallback(data: {
    email: string;
    googleId: string;
    displayName: string;
    picture?: string;
  }): Promise<{ token: string }> {
    let user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: data.email,
          googleId: data.googleId,
          displayName: data.displayName,
          picture: data.picture,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { email: data.email },
        data: {
          googleId: data.googleId,
          displayName: data.displayName,
          picture: data.picture,
        },
      });
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });

    return { token };
  }
}
