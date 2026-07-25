// Help center content and search.
//
// Articles are structured data, not markdown files: predictable rendering,
// type-checked links, and section-level anchors for deep linking (both from
// app screens and from search results).
//
// Writing rules for this file (style guide):
//   • Crisp. Short sentences. Every setting gets a definition, not an essay.
//   • No em dashes in copy (product style rule).
//   • Only describe SHIPPED behavior. Roadmap items don't belong in help.
//   • Keep keywords generous: they feed search.

export type HelpItem = { term: string; def: string };

export type HelpSection = {
  /** Anchor id, stable once published (deep links depend on it). */
  id: string;
  heading: string;
  /** Paragraphs. */
  body?: string[];
  /** Definition list, used for settings and fields. */
  items?: HelpItem[];
};

export type HelpArticle = {
  slug: string;
  title: string;
  category: (typeof HELP_CATEGORIES)[number];
  /** One-liner shown in the index and under search results. */
  summary: string;
  /** Opening paragraphs: what this is and how it helps. Shown before the
   *  sections on the help page. */
  intro?: string[];
  keywords: string[];
  sections: HelpSection[];
  related?: string[];
};

export const HELP_CATEGORIES = [
  "Getting started",
  "Participants",
  "Shoot day",
  "Photos",
  "Galleries & delivery",
] as const;

export const HELP_ARTICLES: HelpArticle[] = [
  // ------------------------------------------------------------------
  // Getting started
  // ------------------------------------------------------------------
  {
    slug: "what-is-headshotdesk",
    title: "What is HeadshotDesk?",
    category: "Getting started",
    summary: "The product in two minutes: what it does and how a shoot flows through it.",
    intro: [
      "HeadshotDesk is built for photographers who shoot headshots for teams, offices, and events. This page gives you the lay of the land: the three things you work with and the five steps every shoot moves through. Five minutes here and the rest of the product should feel familiar.",
    ],
    keywords: ["overview", "introduction", "start", "workflow", "about"],
    sections: [
      {
        id: "overview",
        heading: "The short version",
        body: [
          "HeadshotDesk runs the admin around a team headshot shoot. People sign themselves up, shoot day runs off a queue, photos file themselves under the right person, and every participant gets a private gallery by email.",
          "You work with three things: a job (one shoot), its participants (the people photographed), and their photos.",
        ],
      },
      {
        id: "flow",
        heading: "The flow",
        items: [
          { term: "1. Create a job", def: "Name, date, location, and how many headshots each person may keep." },
          { term: "2. Add participants", def: "Share the signup link, import a CSV, or add people by hand." },
          { term: "3. Shoot", def: "Work through the queue. Tap a name to copy it for your tethering tool." },
          { term: "4. Photos sort themselves", def: "Upload or map a watch folder. Files match to participants by filename." },
          { term: "5. Deliver", def: "One click emails everyone a private gallery of their own photos." },
        ],
      },
      {
        id: "beta",
        heading: "Beta",
        body: [
          "HeadshotDesk is in beta and free while we polish. Found something confusing or broken? Email info@pantherstudios.nl. Beta feedback steers the roadmap directly.",
        ],
      },
    ],
    related: ["create-a-job", "add-participants", "deliver-emails"],
  },
  {
    slug: "create-your-account",
    title: "Create your account",
    category: "Getting started",
    summary: "Signing up, what the studio name is for, and resetting your password.",
    intro: [
      "Your account is where all your jobs, participants, and photos live. Setting it up takes a minute, and the names you enter here appear in the emails participants receive, so it is worth getting them right.",
    ],
    keywords: ["signup", "register", "password", "reset", "forgot", "studio name", "account"],
    sections: [
      {
        id: "signup",
        heading: "Signing up",
        items: [
          { term: "Your name", def: "Used to sign gallery emails to participants." },
          { term: "Studio or business name", def: "Shown on participant-facing emails. Change it anytime." },
          { term: "Email", def: "Your login. Password resets go here." },
          { term: "Password", def: "At least 8 characters. You confirm it once to catch typos." },
        ],
      },
      {
        id: "reset-password",
        heading: "Forgot your password?",
        body: [
          "Use the reset link on the sign-in page. We email you a link that works for one hour. If it does not arrive, check spam, then request a new one.",
        ],
      },
    ],
    related: ["what-is-headshotdesk"],
  },
  {
    slug: "create-a-job",
    title: "Create a job",
    category: "Getting started",
    summary: "Every field on the New Job form, what it controls, and how to change it later.",
    intro: [
      "A job is one shoot: one client, one date, one list of people to photograph. Everything else in HeadshotDesk hangs off a job, so this is always the first step.",
      "The form is a handful of fields, and every one of them can be changed later, so there is no wrong way to start.",
    ],
    keywords: [
      "new job", "job name", "shoot date", "location", "headshots per participant",
      "download cap", "download limit", "client name", "client email", "client logo", "edit job", "archive",
    ],
    sections: [
      {
        id: "fields",
        heading: "Shoot details",
        items: [
          { term: "Job name", def: "How the shoot appears everywhere: your job list, the signup page, galleries, and delivery emails. Example: Acme HQ team headshots." },
          { term: "Shoot date", def: "Shown on the signup page and used for the countdown on your job page. Today or later." },
          { term: "Location", def: "Shown on the signup page so participants know where to be." },
          { term: "Headshots per participant", def: "How many photos each person may download from their gallery. Defaults to 1. Set 0 to disable downloads. Change it anytime, even after delivery." },
          { term: "How does shoot day run", def: "Walk-up queue (you pick who is next) or time slots (participants book an appointment while signing up). See the time-slot booking topic for the full picture." },
        ],
      },
      {
        id: "headshots-per-participant",
        heading: "How the download limit works",
        body: [
          "The limit counts unique photos, not download clicks. If someone saves the same photo twice, it counts once. Downloads they have already made stay available forever, at no cost against the limit.",
          "Raising the limit later gives everyone more picks immediately. Lowering it never takes away photos someone already saved.",
        ],
      },
      {
        id: "client",
        heading: "Client details",
        items: [
          { term: "Client name", def: "Optional. The company you are shooting for. Shown on the participant signup page." },
          { term: "Client email", def: "Optional. Your booking contact. Reserved for CC on delivery in a future update; not emailed today." },
          { term: "Client logo", def: "Coming soon. You will upload it once per client and it will appear on signup pages and galleries." },
        ],
      },
      {
        id: "edit-archive",
        heading: "Editing and archiving",
        body: [
          "Edit any field later with the Edit button on the job page, or the three-dot menu on the jobs list.",
          "Archive hides a job from your active list and switches off its public pages: the signup link and all galleries stop working. Use it when a job is fully wrapped.",
        ],
      },
    ],
    related: ["job-statuses", "add-participants", "galleries"],
  },
  {
    slug: "job-statuses",
    title: "Job statuses explained",
    category: "Getting started",
    summary: "What Draft, Open for signup, In progress, Delivered, and Archived mean.",
    intro: [
      "Every job carries a status so you can see where each shoot stands at a glance, from the jobs list or the stepper on the job page. Statuses advance on their own as you work; there is nothing to maintain by hand.",
    ],
    keywords: ["status", "draft", "open for signup", "in progress", "delivered", "archived", "stepper", "progress"],
    sections: [
      {
        id: "statuses",
        heading: "The five statuses",
        items: [
          { term: "Draft", def: "Job created, nothing has happened yet." },
          { term: "Open for signup", def: "At least one participant is on the list." },
          { term: "In progress", def: "You marked the first person as shot." },
          { term: "Delivered", def: "Every deliverable participant has received their gallery email." },
          { term: "Archived", def: "You closed the job. Hidden from the active list; public pages are off." },
        ],
      },
      {
        id: "automatic",
        heading: "Statuses move by themselves",
        body: [
          "You never set a status by hand. Adding the first participant, marking the first shot, and completing delivery each advance the job automatically. Archiving is the only manual step.",
          "The stepper at the top of each job page shows where you are: Setup, Shoot day, Delivery, Done.",
        ],
      },
    ],
    related: ["create-a-job", "deliver-emails"],
  },

  // ------------------------------------------------------------------
  // Participants
  // ------------------------------------------------------------------
  {
    slug: "add-participants",
    title: "Adding participants",
    category: "Participants",
    summary: "Three ways to build the list, what each field does, and the status pills.",
    intro: [
      "Participants are the people you photograph. Getting them into the job early pays off all day: the shoot queue, filename matching, and gallery delivery all run off this list.",
      "Build the list whichever way suits the job. The three ways combine freely, so a CSV import plus a few walk-ins added by hand is perfectly normal.",
    ],
    keywords: ["participants", "add", "manual", "email", "title", "remove", "pending", "shot", "status pill"],
    sections: [
      {
        id: "three-ways",
        heading: "Three ways in",
        items: [
          { term: "Signup link", def: "Share one link; people add themselves. Least work for you." },
          { term: "CSV import", def: "Upload the list HR sent you. See the CSV import article for the format." },
          { term: "Add participant", def: "Type one person in by hand. Good for last-minute walk-ins." },
        ],
      },
      {
        id: "fields",
        heading: "Participant fields",
        items: [
          { term: "Name", def: "Required. Used for filename matching, so spell it the way your camera files will." },
          { term: "Email", def: "Optional, but required for gallery delivery. Without it you share their gallery link by hand." },
          { term: "Title or role", def: "Optional. Display only." },
        ],
      },
      {
        id: "statuses",
        heading: "Status pills",
        items: [
          { term: "Pending", def: "Not photographed yet." },
          { term: "Shot", def: "Marked as photographed in the queue, no photos assigned yet." },
          { term: "N photos", def: "Number of photos currently assigned to them." },
          { term: "Delivered", def: "They received their gallery email, with how long ago." },
        ],
      },
      {
        id: "row-actions",
        heading: "Per-person actions",
        body: [
          "Each row has Copy link (their private gallery URL), Email or Resend (send their gallery email), and Remove (deletes the person and their signup data).",
        ],
      },
    ],
    related: ["csv-import", "signup-link", "deliver-emails"],
  },
  {
    slug: "csv-import",
    title: "CSV import",
    category: "Participants",
    summary: "The expected file format, and how duplicates and errors are handled.",
    intro: [
      "Most corporate clients already have the participant list in a spreadsheet. CSV import takes that file as-is and turns it into your participant list in one upload, instead of you retyping thirty names.",
      "It is forgiving about file quirks on purpose: exports from Excel, Numbers, and Google Sheets all work without cleanup.",
    ],
    keywords: ["csv", "import", "excel", "spreadsheet", "columns", "delimiter", "semicolon", "duplicates"],
    sections: [
      {
        id: "format",
        heading: "File format",
        body: [
          "A header row plus one row per person. Column names are case-insensitive.",
        ],
        items: [
          { term: "name", def: "Required column." },
          { term: "email", def: "Optional. Needed later for email delivery." },
          { term: "title", def: "Optional." },
        ],
      },
      {
        id: "tolerance",
        heading: "What just works",
        body: [
          "Commas, semicolons, tabs, and pipes are all detected automatically, so European Excel exports import without conversion. Excel's sep= preamble and hidden BOM characters are handled. Blank rows are ignored.",
        ],
      },
      {
        id: "duplicates-errors",
        heading: "Duplicates and errors",
        body: [
          "Rows with an email already on the job are skipped, not duplicated. Rows with problems (for example an invalid email) are reported one by one with their row number; the rest of the file still imports.",
        ],
      },
    ],
    related: ["add-participants"],
  },
  {
    slug: "signup-link",
    title: "The signup link",
    category: "Participants",
    summary: "Where to find it, what participants see, and how consent works.",
    intro: [
      "The signup link is the lowest-effort way to build your participant list: share one URL and people enter their own details. Names arrive spelled the way people want them, emails arrive typo-free, and nobody chases a spreadsheet.",
      "Privacy consent is collected in the same step, so by shoot day everyone on your list has already agreed to have their photos processed.",
    ],
    keywords: ["signup link", "share", "public page", "consent", "privacy", "register", "self signup"],
    sections: [
      {
        id: "where",
        heading: "Where to find it",
        body: [
          "On the job page, next to the shoot-day card. Copy it, or open it in a new tab to preview what participants see.",
        ],
      },
      {
        id: "what-they-see",
        heading: "What participants see",
        body: [
          "The job name, client name, date, and location, plus a short form: first and last name, email, and an optional title. They also tick a privacy consent box; the signup is refused without it, and the moment of consent is recorded.",
          "If someone signs up twice with the same email, they get a friendly already-signed-up message instead of a duplicate entry.",
          "On time-slot jobs, the form includes a time picker so people choose their appointment as part of signing up.",
        ],
      },
      {
        id: "lifecycle",
        heading: "When the link stops working",
        body: [
          "The link works until you archive the job. Archived jobs show a not-active message instead of the form.",
        ],
      },
    ],
    related: ["add-participants", "create-a-job"],
  },

  // ------------------------------------------------------------------
  // Shoot day
  // ------------------------------------------------------------------
  {
    slug: "shoot-day-queue",
    title: "The shoot-day queue",
    category: "Shoot day",
    summary: "Running the day: Pending and Already shot, clipboard names, mark shot.",
    intro: [
      "The queue is your shoot-day control panel. It shows who is waiting and who is done, keeps the next name one tap from your tethering tool, and feeds the automation that files photos under the right person.",
      "Run the day from this screen and the admin happens as a side effect of shooting.",
    ],
    keywords: ["queue", "shoot day", "tether", "clipboard", "capture one", "mark shot", "reset", "pending"],
    sections: [
      {
        id: "start",
        heading: "Start shooting",
        body: [
          "The Start shooting button on the job page opens the queue: Pending on one side, Already shot on the other.",
        ],
      },
      {
        id: "clipboard",
        heading: "Names on your clipboard",
        body: [
          "Tap a name and it is copied to your clipboard. Paste it as the capture or session name in your tethering tool (Capture One, Smart Shooter, or similar) so files come out named like Jane Doe_0001.jpg. That filename is what makes photos match to the right person automatically.",
        ],
      },
      {
        id: "mark-shot",
        heading: "Mark shot and reset",
        body: [
          "When you finish someone, mark them shot. They move to Already shot with a timestamp. Made a mistake or need a re-shoot? Reset sends them back to Pending.",
          "Marking your first person shot moves the job to In progress.",
        ],
      },
    ],
    related: ["filename-matching", "watch-folder", "job-statuses"],
  },
  {
    slug: "time-slot-booking",
    title: "Time-slot booking",
    category: "Shoot day",
    summary: "Let participants book an appointment while signing up, and run shoot day as a schedule.",
    intro: [
      "For corporate shoot days, a walk-up line wastes everyone's time. In time-slot mode, participants pick an appointment while signing up, and your shoot day becomes a schedule: you always know who is next and when.",
      "Time slots are a per-job choice. Your other jobs can keep the walk-up queue; both modes use the same shoot screen, photos, and delivery.",
    ],
    keywords: [
      "time slots", "booking", "appointments", "schedule", "slot", "book",
      "corporate", "shoot mode", "queue mode", "breaks", "buffer",
    ],
    sections: [
      {
        id: "choose-mode",
        heading: "Choosing the mode",
        body: [
          "Pick the mode when creating the job: walk-up queue or time slots. You can change it on the job page until shooting starts; after the first person is marked shot, the mode is locked for the day.",
          "Switching a time-slot job back to queue removes all existing bookings, so the app asks you to confirm first.",
        ],
      },
      {
        id: "slot-settings",
        heading: "Setting up the slots",
        items: [
          { term: "Day starts and ends", def: "The bookable window on your shoot date, for example 09:00 to 17:00." },
          { term: "Minutes per person", def: "How long each appointment lasts. Five to ten minutes is typical for headshots. Know the headcount but not the slot length? Enter the number of participants and the calculator suggests the minutes per person that fits everyone." },
          { term: "Buffer between slots", def: "Optional breathing room after each appointment, for reviewing frames or resetting." },
          { term: "Breaks", def: "Blocks nobody can book, like lunch. Slots skip over them automatically." },
          { term: "Changing the schedule later", def: "Bookings that still fit the new schedule are kept. Extending the day or adding slots never touches anyone's time; the grid previews your changes and flags any booking that would fall off before you save. Only when a change would remove a booked time (shrinking the day, moving the grid, changing the date) does the app ask you to confirm, and it cancels just those bookings. The Reset button puts the settings back to what was last saved." },
          { term: "Removing and adding individual slots", def: "The slot grid is a live preview of your draft. Hover an open slot and click the small x to take it off the schedule, for example around a meeting nobody told you about; removed slots are listed under the grid and one click restores them. The + Add slot chip at the end appends a slot; its minutes field follows your slot length and you can type a custom one, say a 25-minute slot for the CEO after a day of 10-minute slots. Breaks show inline in the grid as muted chips, so the day reads as one timeline. Nothing changes for participants until you hit Save schedule at the bottom. Booked slots can't be removed directly: move or clear the booking from the Participants table first." },
        ],
      },
      {
        id: "participant-side",
        heading: "What participants see",
        body: [
          "The signup form shows the open times; participants pick one along with their details and everything is booked the moment they submit. Taken slots show as unavailable. If two people go for the same time at the same moment, the second gets a friendly nudge to pick another.",
          "Signing up again with the same email lets someone pick a different time; their old slot frees up automatically.",
          "You can also book on someone's behalf. People you add manually or through a CSV get a Time column in the Participants table: pick a slot there to assign, move, or clear their time. Assigning is optional, so walk-ins can stay without one. Moving or clearing an already booked time always asks for confirmation first, since the participant is counting on it.",
        ],
      },
      {
        id: "shoot-day",
        heading: "On shoot day",
        body: [
          "The Schedule section on the job page shows the whole day as a grid of slots: booked slots carry the person's name, open ones stay empty, and a counter sums it up (say, 42 of 96 booked). It refreshes on its own as new bookings come in, so you can leave the page open while invites go out. The shoot screen sorts the pending list by appointment and shows each person's time next to their name, so the queue works exactly as before, just in schedule order.",
          "Walk-ins still work: add the person as a participant and shoot them whenever there is room.",
        ],
      },
    ],
    related: ["shoot-day-queue", "create-a-job", "signup-link"],
  },

  // ------------------------------------------------------------------
  // Photos
  // ------------------------------------------------------------------
  {
    slug: "upload-photos",
    title: "Uploading photos",
    category: "Photos",
    summary: "Drag and drop, supported formats, duplicates, search, and reassigning.",
    intro: [
      "The Photos section is where every frame of the job lands, already grouped by person. Whether you drag files in after the shoot or let the watch folder stream them in live, the goal is the same: no sorting session, no renaming evening, no folder-per-person on your desktop.",
    ],
    keywords: ["upload", "photos", "drag", "drop", "jpeg", "png", "webp", "heic", "duplicates", "delete", "reassign", "search"],
    sections: [
      {
        id: "upload",
        heading: "Two ways to upload",
        body: [
          "Drag files into the drop zone (or click choose files), or map a watch folder so uploads happen automatically. JPEG, PNG, WebP, and HEIC are accepted, up to 50 MB each.",
        ],
      },
      {
        id: "organization",
        heading: "How photos are organized",
        body: [
          "Photos group under the participant they matched to. Groups start collapsed; the count on each group tells you what is inside. Photos that match nobody go to an Unassigned group that stays open until you resolve it.",
          "Use the dropdown on any photo to move it to a different participant. Your manual choice sticks; automatic matching will not override it.",
        ],
      },
      {
        id: "duplicates",
        heading: "Duplicates",
        body: [
          "If you upload the same image twice (a re-export, a Finder copy), HeadshotDesk recognizes identical files and merges them instead of creating a copy. You will see a duplicates-merged note after upload.",
        ],
      },
      {
        id: "search-delete",
        heading: "Search and bulk delete",
        body: [
          "Search covers participant names and filenames. Select photos with their checkboxes, or a whole group at once, and delete in bulk. Deleting removes the photo from galleries too.",
        ],
      },
    ],
    related: ["watch-folder", "filename-matching"],
  },
  {
    slug: "watch-folder",
    title: "The watch folder",
    category: "Photos",
    summary: "Map your export folder once and let uploads happen while you shoot.",
    intro: [
      "The watch folder removes the upload step entirely. Point HeadshotDesk at the folder your tethering tool exports to, and every new frame uploads and files itself while you keep shooting.",
      "By the time the last person leaves, the job is already sorted online and ready to deliver.",
    ],
    keywords: ["watch folder", "auto upload", "map folder", "sync", "tether", "export", "pause", "holding back"],
    sections: [
      {
        id: "setup",
        heading: "Setup",
        body: [
          "In the Photos section, map the folder your tethering tool exports to. Your browser asks permission once. HeadshotDesk then checks the folder every 10 seconds while the tab is open.",
          "Keep the tab open during the shoot. Watching stops when the tab closes and resumes when you return.",
        ],
      },
      {
        id: "what-uploads",
        heading: "What uploads, and when",
        body: [
          "New image files upload automatically once their participant is marked shot in the queue. Files for people not yet marked shot are held back and upload the moment you mark them. Files that match nobody are listed with the reason so you can fix the filename or add the person.",
        ],
      },
      {
        id: "renames",
        heading: "Renames and duplicates",
        body: [
          "Renaming a file in Finder updates the existing photo instead of uploading a copy. Files with identical content to something already uploaded are merged, not duplicated.",
        ],
      },
      {
        id: "controls",
        heading: "Pause and unmap",
        body: [
          "Pause stops checking without forgetting the folder. Unmap disconnects it entirely. Both are safe; nothing already uploaded is affected.",
        ],
      },
    ],
    related: ["upload-photos", "filename-matching", "shoot-day-queue"],
  },
  {
    slug: "filename-matching",
    title: "How filename matching works",
    category: "Photos",
    summary: "The naming pattern that files photos under the right person automatically.",
    intro: [
      "Matching is how photos find their person without you lifting a finger. It reads participant names out of your filenames, which your tethering tool writes automatically if you use the queue's clipboard names.",
      "Understand the pattern once and misfiled photos mostly stop happening. When something cannot be matched safely, it waits for you instead of guessing.",
    ],
    keywords: ["filename", "matching", "auto match", "naming", "rename", "unassigned", "tokens", "capture one"],
    sections: [
      {
        id: "pattern",
        heading: "The pattern",
        body: [
          "Name your files with the participant's name followed by a number: Jane Doe_0001.jpg. Set this once in your tethering tool using the queue's clipboard names and every frame matches automatically.",
        ],
      },
      {
        id: "rules",
        heading: "Matching rules",
        items: [
          { term: "Case does not matter", def: "jane doe_001.jpg matches Jane Doe." },
          { term: "Exact name wins", def: "A filename containing the full name always beats partial matches." },
          { term: "Partial matches need two words", def: "At least two name words must appear. A file called jane_001.jpg will not guess between Jane Doe and Jane Smith." },
          { term: "No match, no guess", def: "Anything ambiguous goes to Unassigned for you to place by hand." },
        ],
      },
      {
        id: "manual-wins",
        heading: "Your corrections stick",
        body: [
          "Once you assign a photo manually, matching will not move it, even if the file is renamed later.",
        ],
      },
    ],
    related: ["upload-photos", "watch-folder", "shoot-day-queue"],
  },

  // ------------------------------------------------------------------
  // Galleries & delivery
  // ------------------------------------------------------------------
  {
    slug: "galleries",
    title: "What participants see in their gallery",
    category: "Galleries & delivery",
    summary: "Private links, the download limit, single photos versus zip, live updates.",
    intro: [
      "Each participant gets a personal gallery instead of a shared folder: their photos only, on a private link, with the download allowance you chose.",
      "This page shows what that experience looks like from their side, so you know exactly what you are sending before you hit Deliver.",
    ],
    keywords: ["gallery", "participant view", "download", "zip", "limit", "picks", "private link", "live"],
    sections: [
      {
        id: "access",
        heading: "Access",
        body: [
          "Every participant has their own private gallery link. No account, no password: the link is the key, and it only shows that person's photos. You can copy any participant's link from their row.",
        ],
      },
      {
        id: "downloads",
        heading: "Downloading and the limit",
        body: [
          "The gallery states the limit up front, for example: keep up to 2 photos. Picks are counted on unique photos. Once picked, a photo can be re-downloaded forever at no extra cost.",
          "One selected photo saves as a normal JPEG. Two or more save together as a zip.",
        ],
      },
      {
        id: "live",
        heading: "Live updates",
        body: [
          "Open galleries refresh themselves about every 20 seconds. If you upload more photos after delivering, participants see them without doing anything.",
        ],
      },
      {
        id: "lifecycle",
        heading: "When galleries stop working",
        body: [
          "Gallery links keep working until you archive the job.",
        ],
      },
    ],
    related: ["deliver-emails", "create-a-job"],
  },
  {
    slug: "deliver-emails",
    title: "Delivering galleries by email",
    category: "Galleries & delivery",
    summary: "The Deliver button, who gets emailed, resending, and delivery tracking.",
    intro: [
      "Delivery is the payoff step: one click and every finished participant gets an email with a button to their own gallery.",
      "HeadshotDesk tracks who has been emailed and who has downloaded, so answering did-everyone-get-their-photos is a glance at the job page, not an inbox search.",
    ],
    keywords: ["deliver", "email", "send", "resend", "delivered", "gallery email", "notify"],
    sections: [
      {
        id: "eligibility",
        heading: "Who gets emailed",
        body: [
          "Deliver emails every participant who has at least one photo and an email address, and has not been emailed before. The button shows the count, for example Deliver to 8. People without photos or without an email are skipped and reported, never half-emailed.",
        ],
      },
      {
        id: "sending",
        heading: "Sending",
        body: [
          "You confirm before anything sends. The email greets each person by first name, names the job, and has one button: View your gallery. After sending you see a summary of what happened.",
          "Clicking Deliver again later only emails people who were missed or added since. It never spams people who already got theirs, unless you tick the resend option.",
        ],
      },
      {
        id: "resending",
        heading: "Resending",
        body: [
          "To resend to everyone, tick the resend box in the Deliver confirmation. To resend to one person (say you added photos for them afterwards), use Resend on their row.",
        ],
      },
      {
        id: "tracking",
        heading: "Tracking",
        body: [
          "Delivered rows show a check with how long ago the email went out. The Downloads tile on the job page shows how many photos have been picked up against the total allowance. When everyone deliverable has been emailed, the job moves to Delivered.",
        ],
      },
    ],
    related: ["galleries", "add-participants", "job-statuses"],
  },
  {
    slug: "client-dashboard",
    title: "Sharing a live status page with your client",
    category: "Galleries & delivery",
    summary: "The client dashboard link: what your contact sees, sharing, and revoking.",
    intro: [
      "Corporate shoots come with a contact person who wants to know how it is going: how many signed up, has everyone booked, have the photos gone out. The client dashboard answers all of that with one link, so those check-in emails stop landing in your inbox.",
      "Your contact bookmarks the link and sees live progress any time, without an account and without seeing anything private.",
    ],
    keywords: ["client", "dashboard", "share", "status", "progress", "HR", "coordinator", "revoke", "live", "link"],
    sections: [
      {
        id: "sharing",
        heading: "Sharing the link",
        body: [
          "On the job page, under the signup link, click Share client dashboard. You get a private link to copy into an email or chat with your contact. The same button shows the existing link afterwards, so you can copy it again any time.",
        ],
      },
      {
        id: "what-they-see",
        heading: "What your client sees",
        body: [
          "A clean status page with the job name, your studio name, shoot date and location, plus live tiles: how many people signed up, slots booked (on time-slot jobs), how many have been photographed, and how many galleries are delivered. Below that, a per-person list with each name, their booked time, and where they are in the process.",
          "It refreshes itself every 30 seconds, so during signup week and on shoot day the page is always current.",
        ],
      },
      {
        id: "privacy",
        heading: "What they never see",
        body: [
          "No email addresses, no gallery links, no photos. Names and progress only. The page is read-only: your client cannot change anything about the job.",
        ],
      },
      {
        id: "revoking",
        heading: "Revoking access",
        body: [
          "Click Revoke next to the link and it stops working immediately, for everyone holding it. Sharing again creates a fresh link, so a link that leaked or outlived the project is never a risk.",
        ],
      },
    ],
    related: ["deliver-emails", "time-slot-booking", "create-a-job"],
  },
  {
    slug: "clients-and-branding",
    title: "Clients and their logos",
    category: "Getting started",
    summary: "The Clients page, uploading a logo, and everywhere it appears automatically.",
    intro: [
      "Corporate work is repeat work: the same company books you again next year. HeadshotDesk keeps a Client record for each company you shoot for, and their logo lives on it. Upload the logo once, and every job for that client is branded automatically.",
      "The payoff is how delivery feels: a signup page and gallery carrying the client's own logo reads as a deliverable from their brand team, not output from a tool.",
    ],
    keywords: ["client", "logo", "branding", "brand", "upload", "company", "clients page"],
    sections: [
      {
        id: "clients-page",
        heading: "The Clients page",
        body: [
          "Clients in the main menu lists every company you work with, how many jobs each has, and their logo. Add a client by name, rename them any time (linked jobs update too), and delete them once no jobs reference them.",
          "Logos can be PNG, JPEG, or SVG up to 2 MB. Transparent backgrounds look best. Replace or remove a logo any time; every surface updates immediately.",
        ],
      },
      {
        id: "linking-jobs",
        heading: "Linking a job to a client",
        body: [
          "The New Job form has a Client picker: choose an existing client or create one on the spot by typing their name. Typing a name you already use simply reuses that client, so duplicates don't creep in.",
          "Jobs created before this feature were linked automatically based on their client name; they just have no logo until you upload one.",
        ],
      },
      {
        id: "where-it-shows",
        heading: "Where the logo appears",
        body: [
          "Four places, all automatic once the logo is uploaded: the signup page (above the form, where their employees first land), each participant's private gallery, the delivery email, and your own job page header. No logo set? Every surface falls back cleanly to the plain layout.",
        ],
      },
    ],
    related: ["create-a-job", "galleries", "deliver-emails"],
  },
];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

/**
 * Anchor id for a section on the single-page help layout. Prefixed with the
 * article slug because bare section ids (e.g. "fields") repeat across
 * articles.
 */
export function helpSectionAnchor(articleSlug: string, sectionId: string): string {
  return `${articleSlug}--${sectionId}`;
}

export type HelpSearchResult = {
  article: HelpArticle;
  /** Section anchor when the hit is inside a specific section. */
  sectionId?: string;
  sectionHeading?: string;
  /** Snippet of the matching text. */
  snippet: string;
  score: number;
};

/**
 * Simple client-side search. Scores: title > keywords > summary > section
 * heading > section body/items. Returns article-level and section-level hits,
 * deduplicated so each article appears once with its best-matching section.
 */
export function searchHelp(rawQuery: string): HelpSearchResult[] {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);

  const results: HelpSearchResult[] = [];

  for (const article of HELP_ARTICLES) {
    let best: HelpSearchResult | null = null;

    const consider = (r: HelpSearchResult) => {
      if (!best || r.score > best.score) best = r;
    };

    const matchCount = (text: string) =>
      terms.reduce((n, t) => (text.toLowerCase().includes(t) ? n + 1 : n), 0);

    // Title / keywords / summary → article-level hit.
    const titleHits = matchCount(article.title);
    if (titleHits > 0) {
      consider({ article, snippet: article.summary, score: 100 * titleHits });
    }
    const kwHits = matchCount(article.keywords.join(" "));
    if (kwHits > 0) {
      consider({ article, snippet: article.summary, score: 60 * kwHits });
    }
    const summaryHits = matchCount(article.summary);
    if (summaryHits > 0) {
      consider({ article, snippet: article.summary, score: 40 * summaryHits });
    }

    // Sections → section-level hit with snippet.
    for (const section of article.sections) {
      const headingHits = matchCount(section.heading);
      const bodyText = [
        ...(section.body ?? []),
        ...(section.items ?? []).map((i) => `${i.term} ${i.def}`),
      ].join(" ");
      const bodyHits = matchCount(bodyText);
      if (headingHits + bodyHits === 0) continue;

      // Build a snippet around the first matching term.
      let snippet = section.body?.[0] ?? section.items?.[0]?.def ?? article.summary;
      const idx = bodyText.toLowerCase().indexOf(terms[0]);
      if (idx >= 0) {
        const start = Math.max(0, idx - 60);
        snippet =
          (start > 0 ? "…" : "") +
          bodyText.slice(start, idx + 90) +
          (idx + 90 < bodyText.length ? "…" : "");
      }
      consider({
        article,
        sectionId: section.id,
        sectionHeading: section.heading,
        snippet,
        score: 30 * headingHits + 10 * bodyHits,
      });
    }

    if (best) results.push(best);
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 12);
}
