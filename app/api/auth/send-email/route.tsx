import { render } from "@react-email/render";
import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "standardwebhooks";

import { GenericActionEmail } from "@/components/email/generic-action-email";
import { InviteEmail } from "@/components/email/invite-email";
import { ResetPasswordEmail } from "@/components/email/reset-password-email";
import { sendEmailHookSecret } from "@/lib/env";
import { EmailSendError, sendEmail } from "@/lib/email/resend";

/**
 * Supabase Auth's "Send Email" hook. Configured in Supabase Dashboard ->
 * Authentication -> Hooks, pointing at this route, which replaces Supabase's
 * own (development grade, rate limited) email sending entirely: once the
 * hook is enabled, every invite, password reset, magic link, and email
 * change email is delivered by calling this endpoint instead.
 *
 * Supabase treats the response as authoritative for the underlying auth
 * operation: returning a non-2xx here fails the invite/reset call itself,
 * not just the email, which is the correct behaviour (an admin invite that
 * silently can't notify anyone should not report success) but means this
 * route has to fail loudly and specifically rather than swallowing errors.
 */

type EmailActionType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change";

interface SendEmailPayload {
  user: {
    email: string;
    user_metadata?: { role?: string };
  };
  email_data: {
    token_hash: string;
    email_action_type: EmailActionType;
    redirect_to: string;
    site_url: string;
  };
}

function hookError(httpCode: number, message: string) {
  return NextResponse.json({ error: { http_code: httpCode, message } }, { status: httpCode });
}

/** The hook secret Supabase issues starts "v1,whsec_"; the verifier wants the bare base64. */
function verifierSecret(raw: string): string {
  return raw.startsWith("v1,whsec_") ? raw.slice("v1,whsec_".length) : raw;
}

/** Builds the link the email's button points at, out of what Supabase gave us. */
function actionUrl(emailData: SendEmailPayload["email_data"]): string {
  const url = new URL(emailData.redirect_to || emailData.site_url);
  url.searchParams.set("token_hash", emailData.token_hash);
  url.searchParams.set("type", emailData.email_action_type);
  return url.toString();
}

function subjectFor(type: EmailActionType): string {
  switch (type) {
    case "invite":
      return "You're invited to Compass";
    case "recovery":
      return "Reset your Compass password";
    case "magiclink":
      return "Your Compass sign-in link";
    case "email_change":
      return "Confirm your new email for Compass";
    case "signup":
      return "Confirm your Compass account";
    default:
      return "Compass account action";
  }
}

function templateFor(
  type: EmailActionType,
  url: string,
  role: string | undefined,
): React.ReactElement {
  if (type === "invite") {
    return <InviteEmail actionUrl={url} role={role === "admin" ? "admin" : "consultant"} />;
  }
  if (type === "recovery") {
    return <ResetPasswordEmail actionUrl={url} />;
  }
  return <GenericActionEmail actionUrl={url} />;
}

export async function POST(request: NextRequest) {
  const payload = await request.text();

  let verified: SendEmailPayload;
  try {
    const webhook = new Webhook(verifierSecret(sendEmailHookSecret()));
    verified = webhook.verify(payload, Object.fromEntries(request.headers)) as SendEmailPayload;
  } catch (error) {
    console.error("[auth/send-email] signature verification failed", error);
    return hookError(401, "Invalid webhook signature.");
  }

  const { user, email_data: emailData } = verified;

  if (!user?.email || !emailData?.token_hash || !emailData?.email_action_type) {
    return hookError(400, "Malformed send-email hook payload.");
  }

  const url = actionUrl(emailData);
  const element = templateFor(emailData.email_action_type, url, user.user_metadata?.role);

  try {
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);

    await sendEmail({
      to: user.email,
      subject: subjectFor(emailData.email_action_type),
      html,
      text,
    });
  } catch (error) {
    console.error("[auth/send-email] send failed", error);
    const message =
      error instanceof EmailSendError ? error.message : "Could not send the email.";
    return hookError(500, message);
  }

  return NextResponse.json({});
}
