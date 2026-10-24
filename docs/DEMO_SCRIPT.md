# Founder walkthrough (HSD-81)

Fifteen minutes, screen shared, run by Lingaraj. Roughly five demos make one
customer, so the first ten customers are about fifty of these.

## Before the call (2 minutes)

1. Admin → **Demo job** → choose a folder of your own headshots (people who
   agreed to be shown) → **Build demo job**. It replaces the previous demo, so
   every call starts from the same state: day one photographed and mostly
   delivered, favourites and a download, one no-show, two private notes; day
   two booked and waiting. Nobody is emailed; every address is @example.com.
2. Open the demo job in one tab and its shoot screen ("Start shooting") in a
   second.
3. Have one participant's gallery ready: on the job page, Participants, copy a
   delivered person's gallery link and open it in a private window.

## The call

1. **Their pain, first (3 min).** "How do you deliver photos after a 50-person
   shoot today?" Let them describe it: the spreadsheet, the renaming evening,
   WeTransfer, "which one was me?". Write down the hours they mention.
2. **The magic moment (4 min).** Shoot screen: tap the next name, it is on the
   clipboard; show the private note under the person; mark shot. Then the job
   page: photos filed under the right person, per-day status ("day one
   delivered, day two waiting").
3. **Their participant's view (3 min).** The gallery in the private window:
   only their photos, star a favourite, the download limit. Then the client
   dashboard: what HR sees without emailing them.
4. **The time maths (2 min).** Their hours from step 1 against this: signup
   link instead of collecting names, no renaming, one click to deliver. Say
   the number back to them.
5. **Close (2 min).** "The first month is free, no card. Run your next real
   shoot on it, and I'll set it up with you." Book that setup call before
   hanging up.

## After the call

Note in the CRM, same day: demo held, their current tool, the hours they
quoted, next step. The funnel that matters until about 20 customers is demos
booked → held → trials started → paid.

## Setting up the booking link (once)

The "Book a 15-min walkthrough" buttons on the home page stay hidden until a
booking link is configured.

1. Google Calendar → **Create** → **Appointment schedule**. Title "HeadshotDesk
   walkthrough", 15 minutes, your available hours, a buffer of 15 minutes
   between bookings, and Google Meet as the location. Ask for the booker's
   name, email, and "How many people do you usually shoot per job?".
2. Save, then **Share** → copy the booking page link (it looks like
   `https://calendar.app.google/...`).
3. Vercel → headshot-desk → Settings → Environment Variables → add
   `NEXT_PUBLIC_DEMO_URL` with that link for Production and Preview, then
   redeploy.

Clicks on the button arrive in Plausible as the `Demo clicked` goal; the
bookings themselves live in your calendar.
