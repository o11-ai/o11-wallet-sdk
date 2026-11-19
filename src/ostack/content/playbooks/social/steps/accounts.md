---
summary: Confirm each account before touching it.
used_by: [growth]
changed: 0.13.0
change: A signed-out platform is recorded as a sign-in for the person's agent to send them.
---
Read the person's `social/accounts.md`. Skip LinkedIn unless that file has the line `LinkedIn: on`. Open each platform in the browser and confirm the signed-in profile is that
account. If a platform is signed out, on another account, or shows a login or security check, skip it today and report
it. Never type a password or a code. When it is signed out or on another account, also record it for the person:
`o11 ostack run need social/growth --kind sign_in --url <the platform's login page> --ask "Sign in to <platform> as <account>"`.

Then open the person's own list of recent comments on each platform (the link in the accounts file) and note every post
they already commented on in the platform's freshness window, so no post ever gets a second comment across runs.
