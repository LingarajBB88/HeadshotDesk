# Working in this repo

## Where work comes from: "dispatch"

The functional chat is the orchestrator. It details features with
Lingaraj and queues them on the Notion page **DISPATCH — Technical Chat
Work Queue** under the HeadshotDesk hub
(https://app.notion.com/p/3fc5f6bd21bc811c8686efbb0b991a52), ordered in
waves. The HeadshotDesk Backlog database is the spec library, not the
queue.

When Lingaraj says "dispatch", open that page and work it top-down.
Read the item's backlog card before building. When an item is done,
move the card's Status and strike the item through on the DISPATCH page
with the date. He may also hand you tasks directly; those come first.

## Git: commit yourself, using the lock sweep

Do not hand Lingaraj a commit message to copy-paste. He works across
several projects and that is the slowest part of his day. Write the commit
yourself. He runs only `git push`.

The Cowork folder bridge allows create, write and rename, but **denies
`unlink`**. A commit succeeds, then git cannot remove `.git/HEAD.lock`, and
every later git command refuses with "Another git process seems to be
running". The tell is that the first commit of a session works and the
second fails.

Locks cannot be deleted. They **can** be renamed. Set this up once per
session, then use `gitx` for every git call:

```bash
mkdir -p ~/bin && cat > ~/bin/gitx <<'EOF'
#!/bin/bash
set -uo pipefail
R="${GITX_REPO:?}"; G="$R/.git"; TRASH="$G/hd-trash"; mkdir -p "$TRASH" 2>/dev/null
sweep() {
  for f in "$G"/*.lock "$G"/refs/heads/*.lock "$G"/refs/remotes/*/*.lock; do
    [ -e "$f" ] || continue; mv "$f" "$TRASH/$(basename "$f").$RANDOM" 2>/dev/null
  done
  find "$G/objects" -name 'tmp_obj_*' -exec mv {} "$TRASH/" \; 2>/dev/null
}
sweep; git -C "$R" "$@"; s=$?; sweep; exit $s
EOF
chmod +x ~/bin/gitx
export GITX_REPO=/path/to/this/repo
```

The `unable to unlink` warnings git prints are expected. The sweep handles
them. `.git/hd-trash/` accumulates swept files and is inert; suggest
`rm -rf .git/hd-trash && git gc --prune=now` occasionally.

Pushing still needs Lingaraj, since the sandbox has no GitHub credentials.

## Checks before handing work over

`tsc --noEmit` is not enough for the frontend. It does not enforce Next.js
page-export rules, which is how a broken build reached production and every
Vercel deploy failed silently for days. Run `npm --prefix frontend run
build`.

Backend: `docker compose exec backend pytest -q`.

## Copy

No em dashes in anything a user reads. It reads as machine-written and it
is a standing product rule.

Do not put advice in the photographer's mouth. Participant emails carry no
guidance on what to wear or how to prepare; that belongs in the links the
photographer sets in Settings, because they know the client and we do not.

`frontend/lib/help.ts` documents how the product works, never what changed.
Release notes do not belong in a help centre.

## Email

`backend/scripts/preview_emails.py` renders every template with sample data
into one HTML page. Run it after any copy change and read the set side by
side; it is the only reliable way to catch two emails that contradict each
other.
