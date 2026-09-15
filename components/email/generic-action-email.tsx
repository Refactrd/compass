import {
  EmailBody,
  EmailButton,
  EmailHeading,
  EmailLayout,
} from "@/components/email/brand";

/**
 * Fallback for any Supabase Auth email type Compass does not otherwise send
 * (magic link, email change, self-serve signup confirmation). None of these
 * are reachable through the product today, invites and password resets are
 * the only two flows, but the send-email hook receives whatever Supabase
 * Auth emits, and a 5xx here blocks the underlying auth operation. This
 * keeps an unexpected type from failing loudly instead of just looking
 * generic.
 */
export function GenericActionEmail({ actionUrl }: { actionUrl: string }) {
  return (
    <EmailLayout preview="Confirm this action on your Compass account">
      <EmailHeading>Confirm this action</EmailHeading>
      <EmailBody>
        A request was made on your Compass account that needs confirmation.
      </EmailBody>
      <EmailButton href={actionUrl}>Continue</EmailButton>
    </EmailLayout>
  );
}

export default GenericActionEmail;
