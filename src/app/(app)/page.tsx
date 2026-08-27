import { redirect } from "next/navigation";

/**
 * The briefing lands here in P5. Until the notice rule is wired to the UI,
 * sending you to the sector grid is more honest than an empty "Today" page.
 */
export default function HomePage() {
  redirect("/sectors");
}
