"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { FormField } from "@/components/FormField";
import { Logo } from "@/components/Logo";
import { StudioContact } from "@/components/StudioContact";
import { ApiError } from "@/lib/api";
import { suggestEmail } from "@/lib/emailSuggest";
import { classifyFormError } from "@/lib/form-errors";
import { mentionsClient } from "@/lib/naming";
import {
  bookPublicSlot,
  getPublicJob,
  listPublicSlots,
  publicSignup,
  type PublicJob,
  type PublicSlot,
} from "@/lib/participants";

/** Show a slot's HH:MM. Slots are wall-clock times on the shoot date. */
function slotTime(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * Has this slot already gone?
 *
 * Compared against the browser's clock rather than the server's, on purpose.
 * Slots are stored as wall-clock times labelled UTC (there's no photographer
 * timezone setting yet), so a server-side comparison would be an hour or two
 * out in Amsterdam. Whoever is scanning the QR is standing in the same room
 * as the shoot, so their device clock is the right reference.
 */
function isPast(iso: string): boolean {
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  const [h, mi] = iso.slice(11, 16).split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi).getTime() < Date.now();
}

export default function PublicSignupPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [job, setJob] = useState<PublicJob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [wasNewSignup, setWasNewSignup] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Compliance: privacy-consent checkbox. Required — the backend also
  // rejects signups without it, this is just the friendly layer.
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  // Controlled so the "did you mean" correction can be applied with one
  // click rather than making someone retype the whole address.
  const [email, setEmail] = useState("");
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  // HSD-55: slot picking on time-slot jobs. The participant selects a time
  // inside the form; the booking itself happens right after signup (the
  // gallery token from the signup response authenticates it). If the chosen
  // time is taken in between, the post-signup picker asks for a new one.
  const [galleryToken, setGalleryToken] = useState<string | null>(null);
  const [slots, setSlots] = useState<PublicSlot[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [bookedSlot, setBookedSlot] = useState<PublicSlot | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  // Which shoot day's times are on screen. Null until the participant picks
  // one, so the default can follow availability as it changes.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const needsSlot = job?.shoot_mode === "time_slot";

  // Walk-ins scanning the QR mid-shoot shouldn't be offered times that have
  // already gone. Past slots are hidden rather than struck through: on a
  // phone at 14:10, a morning's worth of dead buttons is just scrolling.
  const upcomingSlots = (slots ?? []).filter((s) => !isPast(s.start));
  const nextFreeSlot = upcomingSlots.find((s) => s.available) ?? null;
  // All slots gone by: the shoot is over (or the schedule is stale).
  const scheduleFinished = (slots?.length ?? 0) > 0 && upcomingSlots.length === 0;

  // HSD-71: on a shoot that runs several days, pick a day first. Showing
  // every day's times in one long column made a three-day shoot feel like
  // scrolling a timetable, and it wasn't obvious which date a time belonged
  // to once you'd scrolled past the heading.
  const slotDays = [...new Set(upcomingSlots.map((s) => s.start.slice(0, 10)))];
  const multiDay = slotDays.length > 1;
  // Default to the first day that still has something free, so the busiest
  // case (day one fully booked) doesn't open on a wall of dead buttons.
  const defaultDay =
    slotDays.find((d) =>
      upcomingSlots.some((s) => s.start.startsWith(d) && s.available),
    ) ??
    slotDays[0] ??
    null;
  const activeDay = selectedDay ?? defaultDay;
  const visibleSlots = multiDay
    ? upcomingSlots.filter((s) => s.start.startsWith(activeDay ?? ""))
    : upcomingSlots;

  function dayLabel(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  async function refreshSlots() {
    try {
      setSlots(await listPublicSlots(slug));
    } catch {
      setSlots([]);
    }
  }

  async function pickSlot(slot: PublicSlot) {
    if (!galleryToken) return;
    setBooking(slot.start);
    setSlotError(null);
    try {
      const booked = await bookPublicSlot(slug, galleryToken, slot.start);
      setBookedSlot(booked);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSlotError("That time was just taken. Pick another.");
        await refreshSlots();
      } else {
        setSlotError("Didn't go through. Try again?");
      }
    } finally {
      setBooking(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await getPublicJob(slug);
        if (cancelled) return;
        setJob(j);
        // Time-slot jobs: load availability up front so the picker sits
        // inside the form and people choose their time before submitting.
        if (j.shoot_mode === "time_slot") {
          try {
            const s = await listPublicSlots(slug);
            if (!cancelled) setSlots(s);
          } catch {
            if (!cancelled) setSlots([]);
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError("This signup link isn't active. Ask your photographer for a new link.");
        } else {
          setLoadError("Could not load signup page.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Arriving from a "change your slot" link in an email. The token names
  // the participant, so skip the form entirely and drop them on the
  // picker as themselves. This is the whole point of the token: without
  // it, someone re-entering a different email address would become a
  // second participant and take a second slot while their first stayed
  // booked.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t");
    if (!token) return;
    setGalleryToken(token);
    setSubmitted(true);
    setWasNewSignup(false);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const data = new FormData(e.currentTarget);
      const firstName = String(data.get("first_name") ?? "").trim();
      const lastName = String(data.get("last_name") ?? "").trim();

      // Local validation — first name required.
      if (!firstName) {
        setFieldErrors({ first_name: "Required." });
        setSubmitting(false);
        return;
      }
      if (!consent) {
        setConsentError("Please accept the privacy terms to sign up.");
        setSubmitting(false);
        return;
      }
      setConsentError(null);
      // Time-slot jobs with a configured schedule: a time must be chosen
      // before submitting.
      // Don't block signup when every time has already passed: a late walk-in
      // still needs to be on the list so the photographer can decide.
      if (needsSlot && upcomingSlots.length > 0 && !selectedSlot) {
        setSlotError("Pick a time before signing up.");
        setSubmitting(false);
        return;
      }
      setSlotError(null);

      // Backend stores a single `name` field; combine on the way out.
      // Keeps UI flexible without forcing a data model change.
      const fullName = lastName ? `${firstName} ${lastName}` : firstName;

      // Signup and booking go in one request. Two meant two emails, and
      // left a window where the signup landed but the booking silently
      // didn't.
      const result = await publicSignup(slug, {
        name: fullName,
        email: email.trim(),
        title: (String(data.get("title") ?? "").trim()) || null,
        consent: true,
        slotStart: needsSlot ? selectedSlot : null,
      });
      setWasNewSignup(result.created);
      setGalleryToken(result.participant.gallery_token);

      if (result.booked_slot) {
        setBookedSlot({
          start: result.booked_slot.start,
          end: result.booked_slot.end,
          available: false,
        });
      } else if (result.slot_taken) {
        // Someone else got there first. They're still signed up, so put
        // them on the picker rather than failing the whole form.
        setSlotError("That time was just taken. Pick another.");
        setSelectedSlot(null);
        await refreshSlots();
      } else if (needsSlot) {
        await refreshSlots();
      }
      setSubmitted(true);
    } catch (err) {
      const c = classifyFormError(err);
      if (c.fieldErrors) {
        // Backend emits errors on the unified `name` field — surface them on first_name.
        const remapped: Record<string, string> = { ...c.fieldErrors };
        if (remapped.name) {
          remapped.first_name = remapped.name;
          delete remapped.name;
        }
        setFieldErrors(remapped);
      } else if (c.formError) setFormError(c.formError);
      else setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-12 bg-muted-50">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          {/* HSD-36: the client's logo leads when set — participants see
              their employer's branding first. HeadshotDesk moves to the
              footer role via the card below. */}
          {job?.client_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.client_logo_url}
              alt={job.client_name ? `${job.client_name} logo` : "Company logo"}
              className="max-h-16 max-w-[220px] object-contain"
            />
          ) : (
            <Logo size="md" wordmark />
          )}
        </div>

        <div className="bg-paper border border-muted-200 rounded-dialog p-8 shadow-sm">
          {loadError ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : !job ? (
            <p className="text-sm text-muted-600">Loading…</p>
          ) : submitted && needsSlot && !bookedSlot ? (
            <>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Pick your time
              </h1>
              <p className="mt-2 text-sm text-muted-600">
                You&apos;re on the list for{" "}
                <strong className="text-ink">{job.name}</strong>. Choose the
                slot that suits you
                {job.shoot_date ? <> on {job.shoot_date}</> : null}.
              </p>
              {slotError ? (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {slotError}
                </p>
              ) : null}
              {slots === null ? (
                <p className="mt-4 text-sm text-muted-600">Loading times…</p>
              ) : slots.length === 0 ? (
                <p className="mt-4 text-sm text-muted-600">
                  The schedule isn&apos;t set up yet. You&apos;re signed up;
                  your photographer will share times separately.
                </p>
              ) : scheduleFinished ? (
                <p className="mt-4 text-sm text-muted-600">
                  All the times for today have passed. You&apos;re signed up,
                  so ask your photographer whether they can still fit you in.
                </p>
              ) : (
                <>
                  {/* Two taps for someone standing at the booth: the common
                      case is "whatever's next", not browsing a grid. */}
                  {nextFreeSlot ? (
                    <button
                      type="button"
                      disabled={booking !== null}
                      onClick={() => pickSlot(nextFreeSlot)}
                      className="mt-4 w-full btn-primary disabled:opacity-60"
                    >
                      {booking === nextFreeSlot.start
                        ? "Booking…"
                        : `Take the next free time (${
                            multiDay
                              ? `${dayLabel(nextFreeSlot.start.slice(0, 10))}, `
                              : ""
                          }${slotTime(nextFreeSlot.start)})`}
                    </button>
                  ) : null}
                  {nextFreeSlot ? (
                    <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-600">
                      Or pick another time
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <DayTabs
                      days={slotDays}
                      active={activeDay}
                      slots={upcomingSlots}
                      onPick={setSelectedDay}
                      label={dayLabel}
                    />
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {visibleSlots.map((s) => (
                      <button
                        key={s.start}
                        type="button"
                        disabled={!s.available || booking !== null}
                        onClick={() => pickSlot(s)}
                        className={
                          "rounded-md border px-2 py-2 text-sm font-medium transition " +
                          (!s.available
                            ? "border-muted-200 bg-muted-100 text-muted-400 cursor-not-allowed line-through"
                            : booking === s.start
                              ? "border-accent bg-accent text-accent-fg"
                              : "border-muted-200 bg-paper text-ink hover:border-accent hover:bg-accent-muted")
                        }
                      >
                        {booking === s.start ? "…" : slotTime(s.start)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : submitted ? (
            <>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {bookedSlot
                  ? "You're booked"
                  : wasNewSignup
                    ? "You're on the list"
                    : "You're already signed up"}
              </h1>
              <p className="mt-2 text-sm text-muted-600">
                {bookedSlot ? (
                  <>
                    Your headshot slot for{" "}
                    <strong className="text-ink">{job.name}</strong> is{" "}
                    <strong className="text-ink">
                      {slotTime(bookedSlot.start)}
                    </strong>
                    {job.shoot_date ? <> on {job.shoot_date}</> : null}.
                  </>
                ) : wasNewSignup ? (
                  <>
                    We&apos;ve added you to{" "}
                    <strong className="text-ink">{job.name}</strong>. See you
                    on the day.
                  </>
                ) : (
                  <>
                    We already had your details for{" "}
                    <strong className="text-ink">{job.name}</strong>. No need to
                    sign up again. See you on shoot day.
                  </>
                )}
              </p>
              {job.shoot_date ? (
                <p className="mt-4 text-sm text-muted-600">
                  <span className="font-medium text-ink">Shoot date:</span> {job.shoot_date}
                </p>
              ) : null}
              {job.location ? (
                <p className="mt-1 text-sm text-muted-600">
                  <span className="font-medium text-ink">Location:</span> {job.location}
                </p>
              ) : null}
              {bookedSlot ? (
                <p className="mt-1 text-sm text-muted-600">
                  <span className="font-medium text-ink">Your time:</span>{" "}
                  {slotTime(bookedSlot.start)} to {slotTime(bookedSlot.end)}
                </p>
              ) : null}
              {/* Walk-up jobs have no appointment to show, so give people the
                  next best thing: a live position they can watch from their
                  desk instead of standing in a line. */}
              {!needsSlot && galleryToken ? (
                <a
                  href={`/q/${galleryToken}`}
                  className="mt-6 inline-block btn-primary"
                >
                  See your place in the queue
                </a>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Sign up for headshots
              </h1>
              <p className="mt-1 text-sm text-muted-600">
                You&apos;re registering for{" "}
                <strong className="text-ink">{job.name}</strong>
                {job.client_name && !mentionsClient(job.name, job.client_name) ? (
                  <> with {job.client_name}</>
                ) : null}
                .
              </p>

              {(job.shoot_date || job.location) && (
                <dl className="mt-4 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-muted-50 rounded-md p-3">
                  {job.shoot_date ? (
                    <div>
                      <dt className="font-medium text-muted-600 uppercase tracking-wider">
                        Date
                      </dt>
                      <dd className="text-ink">{job.shoot_date}</dd>
                    </div>
                  ) : null}
                  {job.location ? (
                    <div>
                      <dt className="font-medium text-muted-600 uppercase tracking-wider">
                        Location
                      </dt>
                      <dd className="text-ink">{job.location}</dd>
                    </div>
                  ) : null}
                </dl>
              )}

              <form onSubmit={onSubmit} noValidate>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    label="First name"
                    name="first_name"
                    autoComplete="given-name"
                    required
                    error={fieldErrors.first_name}
                  />
                  <FormField
                    label="Last name"
                    name="last_name"
                    autoComplete="family-name"
                    error={fieldErrors.last_name}
                  />
                </div>
                <FormField
                  label="Email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailSuggestion) setEmailSuggestion(null);
                  }}
                  // Checked when they leave the field, not on every
                  // keystroke: "l@gmai" is not a typo, it is someone who
                  // has not finished typing.
                  onBlur={(e) => setEmailSuggestion(suggestEmail(e.target.value))}
                  // No hint: it used to say "where we'll send your photo
                  // gallery", which promises delivery the photographer may
                  // not be using. Plenty run a shoot through here and hand
                  // the files over themselves.
                  error={fieldErrors.email}
                />
                {/* Offered, never enforced. A wrong domain passes every
                    format check, so the first anyone hears of it is the
                    gallery never arriving, days after the shoot. */}
                {emailSuggestion ? (
                  <p className="-mt-2 mb-3 text-sm text-muted-600">
                    Did you mean{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(emailSuggestion);
                        setEmailSuggestion(null);
                      }}
                      className="font-medium text-accent underline"
                    >
                      {emailSuggestion}
                    </button>
                    ?
                  </p>
                ) : null}
                <FormField
                  label="Title or role"
                  name="title"
                  hint="Optional. Shown alongside your photos."
                  error={fieldErrors.title}
                />

                {/* HSD-55: time picker inside the form on time-slot jobs.
                    Selection only; the actual booking happens on submit. */}
                {needsSlot && slots && slots.length > 0 ? (
                  <div className="mb-4">
                    <span className="block text-sm font-medium text-ink mb-1.5">
                      Pick your time
                    </span>
                    {/* Times already gone are dropped, so someone signing up
                        mid-shoot only sees what they can actually take. */}
                    {scheduleFinished ? (
                      <p className="text-sm text-muted-600">
                        All of today&apos;s times have passed. Sign up anyway
                        and your photographer will fit you in if they can.
                      </p>
                    ) : null}
                    {nextFreeSlot ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSlot(nextFreeSlot.start);
                          // Jump to the day it's on, so the highlighted
                          // button is actually visible.
                          setSelectedDay(nextFreeSlot.start.slice(0, 10));
                        }}
                        className={
                          "mb-3 w-full rounded-md border px-3 py-2 text-sm font-medium transition " +
                          (selectedSlot === nextFreeSlot.start
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-accent text-accent hover:bg-accent-muted")
                        }
                        aria-pressed={selectedSlot === nextFreeSlot.start}
                      >
                        Next free time:{" "}
                        {multiDay
                          ? `${dayLabel(nextFreeSlot.start.slice(0, 10))}, `
                          : ""}
                        {slotTime(nextFreeSlot.start)}
                      </button>
                    ) : null}
                    {/* HSD-71: pick a day, then a time on that day. */}
                    <DayTabs
                      days={slotDays}
                      active={activeDay}
                      slots={upcomingSlots}
                      onPick={(d) => {
                        setSelectedDay(d);
                        // A time on another day is no longer visible, so
                        // holding onto it would be a silent surprise.
                        if (selectedSlot && !selectedSlot.startsWith(d)) {
                          setSelectedSlot(null);
                        }
                      }}
                      label={dayLabel}
                    />
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {visibleSlots.map((s) => (
                        <button
                          key={s.start}
                          type="button"
                          disabled={!s.available}
                          onClick={() =>
                            setSelectedSlot(
                              selectedSlot === s.start ? null : s.start,
                            )
                          }
                          className={
                            "rounded-md border px-2 py-2 text-sm font-medium transition " +
                            (!s.available
                              ? "border-muted-200 bg-muted-100 text-muted-400 cursor-not-allowed line-through"
                              : selectedSlot === s.start
                                ? "border-accent bg-accent text-accent-fg"
                                : "border-muted-200 bg-paper text-ink hover:border-accent hover:bg-accent-muted")
                          }
                          aria-pressed={selectedSlot === s.start}
                        >
                          {slotTime(s.start)}
                        </button>
                      ))}
                    </div>
                    {visibleSlots.every((s) => !s.available) &&
                    visibleSlots.length > 0 ? (
                      <p className="mt-2 text-xs text-muted-600">
                        This day is fully booked. Try another day above.
                      </p>
                    ) : null}
                    {slotError ? (
                      <p className="mt-2 text-xs text-red-600" role="alert">
                        {slotError}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* Compliance: explicit consent before we process the
                    participant's name, email, and photos. */}
                <label className="mb-4 flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => {
                      setConsent(e.target.checked);
                      if (e.target.checked) setConsentError(null);
                    }}
                    className="mt-0.5 h-4 w-4 accent-accent cursor-pointer"
                  />
                  <span className="text-xs text-muted-600">
                    I agree that my name, email, and photos are processed to
                    deliver my headshots, as described in the{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      privacy policy
                    </a>
                    .
                  </span>
                </label>
                {consentError ? (
                  <p className="mb-3 -mt-2 text-xs text-red-600" role="alert">
                    {consentError}
                  </p>
                ) : null}

                {formError ? (
                  <p className="mb-4 text-sm text-red-600" role="alert">
                    {formError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? "Submitting…" : "I'm in"}
                </button>
              </form>
            </>
          )}
          {/* Who's photographing them, and anything worth reading first.
              Inside the card so it belongs to the job, not the footer. */}
          {job ? <StudioContact studio={job.studio} className="mt-8" /> : null}
        </div>

        {/* Round-2 polish: render the wordmark via <Logo> instead of plain
            text so the footer matches the brand treatment used elsewhere. */}
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-600">
          <span>Powered by</span>
          <a
            href="https://headshotdesk.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition"
            aria-label="HeadshotDesk"
          >
            <Logo size="sm" wordmark />
          </a>
        </p>
      </div>
    </main>
  );
}

/**
 * Day picker for shoots that run over several days. Renders nothing on a
 * single-day shoot, so those pages look exactly as they did.
 *
 * Each tab carries its own free count. Someone choosing between Tuesday and
 * Wednesday wants to know which one still has room before they click, not
 * after.
 */
function DayTabs({
  days,
  active,
  slots,
  onPick,
  label,
}: {
  days: string[];
  active: string | null;
  slots: PublicSlot[];
  onPick: (day: string) => void;
  label: (iso: string) => string;
}) {
  if (days.length < 2) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {days.map((d) => {
        const free = slots.filter(
          (s) => s.start.startsWith(d) && s.available,
        ).length;
        const isActive = active === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            aria-pressed={isActive}
            disabled={free === 0}
            className={
              "rounded-md border px-3 py-1.5 text-sm font-medium transition " +
              (free === 0
                ? "border-muted-200 bg-muted-100 text-muted-400 cursor-not-allowed"
                : isActive
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-muted-200 bg-paper text-ink hover:border-accent hover:bg-accent-muted")
            }
          >
            {label(d)}
            <span
              className={
                "ml-1.5 text-xs font-normal " +
                (isActive ? "opacity-80" : "text-muted-600")
              }
            >
              {free === 0 ? "full" : `${free} free`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
