"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { signIn } from "@/auth";

export async function googleSignInAction() {
  try {
    await signIn("google", { redirectTo: "/" });
  } catch (error) {
    unstable_rethrow(error);
    redirect("/signin?error=Google");
  }
}

export async function platformAdminSignInAction(formData: FormData) {
  try {
    await signIn("platform-admin", {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/admin",
    });
  } catch (error) {
    unstable_rethrow(error);
    redirect("/signin?method=admin&error=CredentialsSignin");
  }
}

export async function devLoginAction(formData: FormData) {
  try {
    await signIn("dev-login", {
      email: String(formData.get("email") ?? ""),
      redirectTo: "/",
    });
  } catch (error) {
    unstable_rethrow(error);
    redirect("/signin?error=DevLogin");
  }
}
