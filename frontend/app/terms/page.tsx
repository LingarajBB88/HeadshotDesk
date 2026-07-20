import Link from "next/link";

import { Logo } from "@/components/Logo";

// Compliance minimal set (pre-beta). DRAFT written by the team, reviewed by
// Lingaraj before launch — plain-language terms, not legal advice.

export const metadata = {
  title: "Terms of service — HeadshotDesk",
};

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-muted-50 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <Link href="/" aria-label="HeadshotDesk home">
            <Logo size="md" wordmark />
          </Link>
        </div>

        <article className="bg-paper border border-muted-200 rounded-dialog p-8 shadow-sm text-sm text-ink leading-relaxed">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Terms of service
          </h1>
          <p className="mt-1 text-xs text-muted-600">Last updated: 20 July 2026</p>

          <p className="mt-6">
            HeadshotDesk is operated by Panther Studios, Amsterdam, the
            Netherlands. By creating an account or using a signup or gallery
            link, you agree to these terms.
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">The service</h2>
          <p className="mt-2">
            HeadshotDesk lets photographers organize headshot shoots, collect
            participant signups, manage photos, and deliver galleries.
            HeadshotDesk is currently in beta: features may change, and while
            we work hard to keep the service reliable, we can&apos;t guarantee
            uninterrupted availability.
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">
            Your content
          </h2>
          <p className="mt-2">
            Photos and participant data belong to you (the photographer) and
            the people in the photos — not to us. Rights between photographer
            and participants are governed by their own agreement; HeadshotDesk
            just stores and delivers. We only use your content to operate the
            service, as described in the{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              privacy policy
            </Link>
            .
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">
            Photographer responsibilities
          </h2>
          <p className="mt-2">
            If you upload participant data (manually or via CSV), you confirm
            you have a lawful basis to share it with us for processing. You are
            responsible for what you photograph and upload; content that is
            unlawful or infringes the rights of others is not allowed.
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">Accounts</h2>
          <p className="mt-2">
            Keep your credentials secure — you are responsible for activity on
            your account. We may suspend accounts that violate these terms or
            put the service or other users at risk.
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">Liability</h2>
          <p className="mt-2">
            The service is provided as-is during beta. To the extent permitted
            by law, our liability is limited to the amount you paid us in the
            12 months before the claim (during the free beta: zero). Keep your
            own backups of irreplaceable photos.
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">Changes</h2>
          <p className="mt-2">
            We may update these terms; material changes will be announced by
            email or in the app. Dutch law applies; disputes go to the courts
            of Amsterdam.
          </p>

          <p className="mt-8 text-xs text-muted-600">
            Questions?{" "}
            <a href="mailto:info@pantherstudios.nl" className="text-accent hover:underline">
              info@pantherstudios.nl
            </a>
          </p>
        </article>
      </div>
    </main>
  );
}
