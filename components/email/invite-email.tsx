import {
  EmailBody,
  EmailButton,
  EmailFinePrint,
  EmailHeading,
  EmailLayout,
} from "@/components/email/brand";

export function InviteEmail({
  actionUrl,
  role,
}: {
  actionUrl: string;
  role: "admin" | "consultant";
}) {
  return (
    <EmailLayout preview="You've been invited to Compass">
      <EmailHeading>You&apos;re invited to Compass</EmailHeading>
      <EmailBody>
        Compass holds Refactrd&apos;s consulting reasoning discipline and
        applies it to your client work: describe a situation in plain
        language and it grounds every answer in Refactrd&apos;s own
        methodology and knowledge base.
        {role === "admin"
          ? " You've been added as an admin, with access to the consultant and document dashboards as well as the chat workspace."
          : ""}
      </EmailBody>
      <EmailButton href={actionUrl}>Set up your account</EmailButton>
      <EmailFinePrint>
        This link is single use and expires in 24 hours. If it has expired by
        the time you open it, ask your admin for a new invite.
      </EmailFinePrint>
    </EmailLayout>
  );
}

export default InviteEmail;
