import { redirect } from "next/navigation";

export default function LegacyOriginalGamePage() {
  redirect("/games/dice");
}
