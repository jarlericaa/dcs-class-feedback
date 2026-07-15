import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(
  options: EmailOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      return { success: false, error: "RESEND_API_KEY not configured" };
    }

    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || "noreply@example.com",
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function sendEmailAsync(options: EmailOptions): Promise<void> {
  await sendEmail(options).catch((error) => {
    console.error("Failed to send email:", error);
  });
}
