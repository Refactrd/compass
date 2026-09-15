import {
  EmailBody,
  EmailButton,
  EmailFinePrint,
  EmailHeading,
  EmailLayout,
} from "@/components/email/brand";

export function ResetPasswordEmail({ actionUrl }: { actionUrl: string }) {
  return (
    <EmailLayout preview="Reset your Compass password">
      <EmailHeading>Reset your password</EmailHeading>
      <EmailBody>
        Someone requested a password reset for your Compass account. If that
        was you, choose a new password below.
      </EmailBody>
      <EmailButton href={actionUrl}>Reset password</EmailButton>
      <EmailFinePrint>
        This link is single use and expires in an hour. If you didn&apos;t
        request this, you can ignore this email. Your password will not
        change.
      </EmailFinePrint>
    </EmailLayout>
  );
}

export default ResetPasswordEmail;
