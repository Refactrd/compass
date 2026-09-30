import { NewEngagementForm } from "@/components/immersion/new-engagement-form";
import { requireActiveMember } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Start an immersion day · Compass" };

export default async function NewEngagementPage() {
  await requireActiveMember();

  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-6 p-6">
      <p className="text-xs font-medium tracking-[0.08em] text-brass-strong uppercase">
        New immersion day
      </p>

      <NewEngagementForm clients={clients ?? []} />
    </div>
  );
}
