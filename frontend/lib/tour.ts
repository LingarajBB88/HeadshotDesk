// Content for the photographer product tour (/tour).
//
// Separated from the rendering for the same reason lib/help.ts is: the
// words are the part that gets revised, and revising them shouldn't mean
// reading JSX. Each stop is one screen of the app with a mock of it and an
// explanation.
//
// Writing rules, same as the help centre:
//   • Only describe SHIPPED behaviour. If it isn't live, it isn't here.
//   • No em dashes (product style rule).
//   • Say what the photographer gets out of it, not what the button does.
//     "Tap a name and it's on your clipboard" beats "click to select".

export type TourStop = {
  /** Stable id, used for the URL hash and progress. */
  id: string;
  /** Rail label. Short: it has to fit on a phone. */
  label: string;
  title: string;
  /** The one sentence that would make someone care about this screen. */
  lead: string;
  body: string[];
  /** Concrete details. Rendered as a short list under the body. */
  points?: string[];
  /** Which mock to draw. Matches a case in the tour page's renderer. */
  mock:
    | "jobs"
    | "job"
    | "signup"
    | "schedule"
    | "queue"
    | "photos"
    | "gallery"
    | "deliver"
    | "client";
  /** Deep link into the real feature's help article, for the curious. */
  help?: string;
};

export const TOUR_STOPS: TourStop[] = [
  {
    id: "jobs",
    label: "Jobs",
    title: "Every shoot is a job",
    lead: "One job holds one shoot: the people, the schedule, the photos, and who has been sent what.",
    body: [
      "Your job list is the home screen. Each row shows where a shoot has got to, so you can tell at a glance which one needs attention.",
      "Creating one takes about two minutes and nothing is permanent. Date, location, and how many photos each person keeps can all be changed later, including after you have delivered.",
    ],
    points: [
      "Status moves on its own as you work: draft, signup open, in progress, delivered.",
      "Archive a finished shoot to get it out of the way. Galleries you have already sent keep working.",
    ],
    mock: "jobs",
    help: "create-a-job",
  },
  {
    id: "signup",
    label: "Signup link",
    title: "People add themselves",
    lead: "Every job gets its own signup page. Share one link and the list builds itself.",
    body: [
      "This is the part that usually eats an afternoon. Send the link to your client contact, they forward it to the team, and names and email addresses arrive without you typing any of them.",
      "Already have a list from HR? Import the spreadsheet instead. CSV, Excel, and Apple Numbers all work, and a time column books people straight into slots.",
    ],
    points: [
      "Consent is collected at signup, so the answer to an HR privacy question is yes.",
      "Print a QR card for the booth and walk-ins add themselves on the day.",
    ],
    mock: "signup",
    help: "signup-link",
  },
  {
    id: "schedule",
    label: "Schedule",
    title: "Book the day, or run a queue",
    lead: "Time slots turn a shoot day into a schedule. Walk-up mode keeps it flexible.",
    body: [
      "In time-slot mode, participants pick their own appointment while signing up. You set the hours, how long each person takes, and any breaks, and the grid builds itself.",
      "A shoot too big for one day can run across several, and each day can have its own hours and breaks. Change the schedule later and only bookings that no longer fit are affected, after you confirm.",
    ],
    points: [
      "Know the headcount? Type it in and we work out how long each slot should be.",
      "Walk-up jobs skip all of this. People arrive when they can and see their live place in the queue.",
    ],
    mock: "schedule",
    help: "time-slot-booking",
  },
  {
    id: "queue",
    label: "Shoot day",
    title: "The screen you use while shooting",
    lead: "Tap a name and it lands on your clipboard, so your tethering software names the files for you.",
    body: [
      "Set Capture One or Lightroom to name files from the clipboard once. From then on, tapping the next person means their frames come out as Jane Doe_0001.jpg, which is what lets photos file themselves later.",
      "Mark someone shot and they move across. Someone did not turn up? Flag them, and they get a follow-up with a rebooking link while your client gets an attendance report.",
    ],
    points: [
      "Search finds anyone who turns up out of order.",
      "It keeps working with no connection. Everything you tap is saved on the device and syncs when the signal comes back.",
    ],
    mock: "queue",
    help: "shoot-day-queue",
  },
  {
    id: "photos",
    label: "Photos",
    title: "Photos file themselves",
    lead: "Point us at your export folder once. New frames upload and sort themselves while you keep shooting.",
    body: [
      "The watch folder notices every new file, matches it to a participant by the filename, and uploads it in the background. Duplicates are skipped by content, so re-exporting the same frame costs nothing.",
      "Anything that does not match is listed with the reason, so you can fix a filename or add the person rather than discovering the gap at delivery.",
    ],
    points: [
      "Rename a file in Finder and we follow the rename instead of uploading it twice.",
      "Files for someone not yet marked shot are held back and upload the moment you mark them.",
    ],
    mock: "photos",
    help: "watch-folder",
  },
  {
    id: "gallery",
    label: "Galleries",
    title: "Everyone gets their own",
    lead: "A private gallery per person, showing only their photos.",
    body: [
      "Each participant gets a link that works without a login and shows nobody else's pictures. They pick within the limit you set and download.",
      "Turn on favourites and they star the ones they want, which builds your retouch list without an email thread.",
    ],
    points: [
      "Re-downloads are always free and never count against the limit.",
      "Upload more photos later and open galleries update on their own.",
    ],
    mock: "gallery",
    help: "galleries",
  },
  {
    id: "deliver",
    label: "Delivery",
    title: "One click sends everything",
    lead: "Deliver emails every finished participant their own gallery.",
    body: [
      "The email carries the job's actual rules: how many photos are waiting, how many they may keep, whether you are asking them to star favourites. It is branded with your client's logo if you have uploaded one.",
      "It is safe to press twice. People already delivered are skipped unless you deliberately choose to resend.",
    ],
    points: [
      "You see exactly who was sent, who was skipped, and why.",
      "Anyone who has not opened their gallery after a few days gets one reminder.",
    ],
    mock: "deliver",
    help: "deliver-emails",
  },
  {
    id: "client",
    label: "Client view",
    title: "Stop answering status emails",
    lead: "A live link your client can watch without asking you for updates.",
    body: [
      "Signups, bookings, who has been photographed, who has been delivered. It updates itself, needs no login, and shows no email addresses or gallery links.",
      "Revoke it whenever you like. Sharing again creates a fresh link.",
    ],
    points: [
      "Names and progress only. Nothing personal leaves your account.",
      "It is per job, so one client never sees another's shoot.",
    ],
    mock: "client",
    help: "client-dashboard",
  },
];
