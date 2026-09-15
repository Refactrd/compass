import "server-only";

import { Resend } from "resend";

import { resendApiKey, resendFromAddress } from "@/lib/env";

/**
 * Single Resend entry point, same isolation reasoning as lib/ai/client.ts:
 * one wrapper module rather than the SDK reached for from scattered call
 * sites, so a future provider swap or a retry policy change is one file.
 */

let client: Resend | null = null;

function getClient(): Resend {
  client ??= new Resend(resendApiKey());
  return client;
}

export class EmailSendError extends Error {}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const { error } = await getClient().emails.send({
    from: `Compass <${resendFromAddress()}>`,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("[email/resend] send failed", error);
    throw new EmailSendError(error.message);
  }
}
