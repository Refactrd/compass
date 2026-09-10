import { redirect } from "next/navigation";

/**
 * The dashboard has a sidebar now, so a landing page of links to the same three
 * destinations is a click for its own sake. Users is the first thing an admin
 * needs, and it is where the invite flow lives.
 */
export default function AdminIndexPage() {
  redirect("/admin/users");
}
