# Nouture

Sync emacs org notes over unison.

Nouture runs the real unison (2.53.8, static arm64) with Linux-style
`~/.unison/*.prf` profiles and `~/.ssh/config`, so it syncs like another
computer with the same setup. Notes sync when opened, saved, changed by other
apps and when the app is resumed, like the Emacs hooks do on the desktop.

## Building

```sh
npm install
./scripts/build-unison-android.sh   # only when updating unison; needs docker with arm64 emulation
                                    # (also regenerates src/unison/prefs.generated.json)
npm test                            # org parser/edit tests
npm run run:android
```

## Setup on Android

1. Grant "All files access" so the org folder can live in shared storage.
2. SSH: generate a key and add its public key to the server's `~/.ssh/authorized_keys`,
   then describe the server in `~/.ssh/config`, e.g.

   ```
   Host backup
     HostName example.com
     Port 2222
     User me
   ```

3. Add a profile. The form offers unison's own preferences and validates them
   like unison loads profiles (or edit it as text); it's stored as e.g.

   ```
   root = /storage/emulated/0/Documents/org
   root = ssh://backup//path/to/org-notes
   batch = true
   fat = true
   ```

   `fat = true` because Android's shared storage is case-insensitive and keeps
   no Unix permissions.

4. Press "Test connection" to review and trust the server's host key, then sync.

## Goals

Later hopefully over SFTP and GIT.
