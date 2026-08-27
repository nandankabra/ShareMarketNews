import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACCESS_COOKIE, accessToken, isGateEnabled, safeEqual } from "@/lib/access";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Unlock" };
export const dynamic = "force-dynamic";

async function unlock(formData: FormData) {
  "use server";

  const password = process.env.ACCESS_PASSWORD;
  if (!isGateEnabled(password)) redirect("/");

  const submitted = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!safeEqual(await accessToken(submitted), await accessToken(password))) {
    redirect(`/unlock?error=1${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  const store = await cookies();
  store.set(ACCESS_COOKIE, await accessToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });

  // Only ever redirect within this site — an open redirect here would let a
  // link that looks like yours bounce someone somewhere else entirely.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (!isGateEnabled(process.env.ACCESS_PASSWORD)) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form action={unlock} className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="bg-primary block size-2 rotate-45 rounded-[1px]" aria-hidden />
            Watch Desk
          </span>
          <p className="text-muted-foreground text-sm">
            This panel is private. Enter the access password to continue.
          </p>
        </div>

        <input type="hidden" name="next" value={params.next ?? "/"} />

        <input
          type="password"
          name="password"
          autoFocus
          required
          autoComplete="current-password"
          aria-label="Access password"
          className="bg-card focus:border-primary/60 rounded-md border px-3 py-2 text-sm outline-none"
        />

        {params.error ? (
          <p className="text-down text-sm" role="alert">
            That password is not right.
          </p>
        ) : null}

        <Button type="submit">Unlock</Button>
      </form>
    </main>
  );
}
