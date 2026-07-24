import Link from "next/link";

import { BrandName } from "@/components/BrandName";
import { Logo } from "@/components/Logo";

// Compliance minimal set (pre-beta). DRAFT written by the team, reviewed by
// Lingaraj before launch — this is a plain-language privacy policy, not
// legal advice. Update the "Last updated" date on every material change.

export const metadata = {
  title: "Privacy policy | HeadshotDesk",
};

export default function PrivacyPage() {
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
            Privacy policy
          </h1>
          <p className="mt-1 text-xs text-muted-600">Last updated: 20 July 2026</p>

          <p className="mt-6">
            <BrandName /> is a service by Panther Studios, Amsterdam, the
            Netherlands (&ldquo;we&rdquo;). It helps photographers organize
            headshot shoots and deliver photos to the people photographed.
            This page explains what personal data we process, why, and what
            your rights are. Questions:{" "}
            <a href="mailto:info@pantherstudios.nl" className="text-accent hover:underline">
              info@pantherstudios.nl
            </a>
            .
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">
            If you were photographed (participant)
          </h2>
          <p className="mt-2">
            Your photographer uses <BrandName /> to run the shoot and deliver
            your photos. For that we process: your name, email address, and
            optional job title (entered by you at signup or by your
            photographer); the photos taken of you; and activity needed to run
            the service, such as when your gallery was emailed, which photos
            you downloaded, and when you accepted these terms. Your
            photographer decides what happens with the shoot. Legally, they
            are the controller for your shoot data and we process it on their
            behalf.
          </p>
          <p className="mt-2">
            We use this data only to run the shoot and deliver your photos. We
            do not sell it, use it for advertising, or use your photos to
            train AI models.
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">
            If you are a photographer (account holder)
          </h2>
          <p className="mt-2">
            We process your name, email, studio name, and password (stored
            hashed) to provide your account, plus the job and participant data
            you add to run your shoots.
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">
            Where your data lives
          </h2>
          <p className="mt-2">
            Application data is hosted with Render (Frankfurt, Germany) and
            photos are stored with Cloudflare R2. The web interface is served
            by Vercel. Delivery and account emails are sent through Postmark.
            These providers process data on our instructions under their data
            processing agreements.
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">Retention</h2>
          <p className="mt-2">
            Shoot data is kept for as long as the photographer keeps the job
            in their account. When a photographer deletes photos, a
            participant, or a job, the associated data is removed. You can
            also ask us or your photographer to remove your data at any time.
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">Your rights</h2>
          <p className="mt-2">
            Under the GDPR you can request access to, correction of, or
            deletion of your personal data, ask for a copy in a portable
            format, and object to or restrict processing. Email{" "}
            <a href="mailto:info@pantherstudios.nl" className="text-accent hover:underline">
              info@pantherstudios.nl
            </a>{" "}
            and we&apos;ll respond within 30 days. You can also complain to
            the Dutch data protection authority (Autoriteit Persoonsgegevens).
          </p>

          <h2 className="mt-8 font-display text-lg font-semibold">Cookies</h2>
          <p className="mt-2">
            <BrandName /> uses only the storage needed to keep you signed in.
            No advertising or cross-site tracking cookies.
          </p>

          <p className="mt-8 text-xs text-muted-600">
            See also our <Link href="/terms" className="text-accent hover:underline">terms of service</Link>.
          </p>
        </article>
      </div>
    </main>
  );
}
