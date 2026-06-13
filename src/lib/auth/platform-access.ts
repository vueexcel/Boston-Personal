import { redirect } from "next/navigation";
import { errEnvelope, jsonEnvelope } from "@/lib/api/response";
import {
  getSessionUserFromCookies,
  type SessionUser,
} from "@/lib/auth/session";

export function isPlatformAdmin(user: SessionUser | null): boolean {
  return user?.role === "PLATFORM_ADMIN";
}

export async function getPlatformAdminUser(): Promise<SessionUser | null> {
  const user = await getSessionUserFromCookies();
  if (!user || !isPlatformAdmin(user)) return null;
  return user;
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/admin/login");
  }
  if (!isPlatformAdmin(user)) {
    redirect("/portal");
  }
  return user;
}

export type PlatformAdminApiAuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

export async function requirePlatformAdminApi(): Promise<PlatformAdminApiAuthResult> {
  const user = await getSessionUserFromCookies();
  if (!user) {
    return {
      ok: false,
      response: jsonEnvelope(
        errEnvelope({
          code: "UNAUTHORIZED",
          message: "Sign in required",
        }),
        { status: 401 },
      ),
    };
  }
  if (!isPlatformAdmin(user)) {
    return {
      ok: false,
      response: jsonEnvelope(
        errEnvelope({
          code: "FORBIDDEN",
          message: "Platform admin access required",
        }),
        { status: 403 },
      ),
    };
  }
  return { ok: true, user };
}
