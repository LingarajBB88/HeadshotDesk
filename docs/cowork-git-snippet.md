# Paste this into any other project chat

Short version, for dropping into a new Cowork chat on a different repo.
Replace the path on the last line.

---

Commit for me yourself, message and all. Never hand me a commit message to
copy-paste. I'll run `git push`.

The Cowork folder bridge allows create, write and rename but denies delete,
so a commit succeeds and then git can't remove `.git/HEAD.lock`. Every later
git command then refuses with "Another git process seems to be running".
The tell is that your first commit works and your second fails.

Locks can't be deleted but they can be renamed. Set this up first, then use
`gitx` instead of `git` for everything:

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
export GITX_REPO=<repo path in the sandbox, e.g. /sessions/*/mnt/YourRepo>
```

The `unable to unlink` warnings git prints are expected; the sweep handles
them. Save this to memory so you don't have to be told again.
