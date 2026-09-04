import { redirect } from "next/navigation";

// /legal is a section, not a page — but people type it, and link to it, and a
// bare 404 there reads as "the legal pages are broken". Send it to the policy.
export default function LegalIndex() {
  redirect("/legal/privacy");
}
