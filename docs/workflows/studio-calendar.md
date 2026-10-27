# Studio calendar

Active members book directly at `/portal/studio`, for up to three hours.
No member Google login and no calendar database are needed. The existing
portal membership system is unchanged.

## One-time Google connection

1. Sign into the portal as `carolinaollive@gmail.com` (must be current staff).
2. Open `/portal/studio/connect` and approve Google access as
   `carolina@moxsf.com`, which must be able to edit the studio calendar.
3. The callback downloads `mox-studio-connection.txt`. It contains an encrypted
   credential, not a password. Keep it private; do not paste it into chat or Git.
4. An administrator installs the file contents as the sensitive Production-only
   Vercel variable `STUDIO_CALENDAR_CONNECTION` and redeploys. With Vercel CLI:
   `vercel env add STUDIO_CALENDAR_CONNECTION production --sensitive < /absolute/path/mox-studio-connection.txt`
   Use `env update` for an existing variable. Never expose it to fork previews.
5. Verify a real member booking appears on the studio Google calendar.

The existing TASKS_GOOGLE_CLIENT_ID, TASKS_GOOGLE_CLIENT_SECRET and registered
`/tasks/auth/google/callback` are reused. Enable Calendar API on that Cloud
project. The callback has separate state and PKCE from task login. Credentials
are sealed using SESSION_SECRET; rotating it requires reconnecting. An OAuth
app in Testing may issue refresh credentials that expire after seven days.

Approval/download is not activation: bookings only work after the Production
variable is installed and deployed. No Vercel management token is placed in the
web application, and no Airtable table is used or created by calendar setup.
