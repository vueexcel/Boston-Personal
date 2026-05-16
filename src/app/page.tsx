import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-lg text-center space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Bostel Voice AI</h1>
        <p className="text-muted-foreground text-sm">
          Next.js 14 App Router stack with Supabase (Postgres), Redis, BullMQ, Twilio,
          ElevenLabs, and OpenAI — tenant-isolated by design.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button asChild>
          <Link href="/signup">Sign up</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/api/health">GET /api/health</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/portal">Customer portal</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/admin/tenants">Platform admin — tenants</Link>
        </Button>
      </div>
    </main>
  );
}
