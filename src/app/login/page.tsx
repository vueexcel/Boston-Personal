import { redirect } from "next/navigation";
import { loginUrl } from "@/lib/auth/routes";

type LoginRedirectPageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

/** Legacy `/login` — preserve query params on canonical root sign-in URL. */
export default function LoginRedirectPage({
  searchParams,
}: LoginRedirectPageProps) {
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params[key] = value;
    else if (Array.isArray(value) && value[0]) params[key] = value[0];
  }
  redirect(loginUrl(params));
}
