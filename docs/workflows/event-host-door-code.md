# Event host door code

Hosts of an event happening today get a shareable door code for their
attendees, through two channels that read the same Verkada access user (the
"Day User"):

1. **Email (Airtable automation "Today's Event Code").** Every day at 7:15am
   Pacific, it reads the Day User's entry code from Verkada, finds events whose
   `Start Date` is today with Status `Confirmed` or `Recurring` and a host
   email, and emails each host the code (cc team@moxsf.com). The Day User's ID
   is the automation's `VERKADA_USER_ID` secret. The email says the code works
   all day and expires at midnight; this repo does not rotate it.
2. **Portal.** On `/portal`, under "events you manage", the same code shows
   below each of the viewer's events matching the same filter (start date
   today in Pacific time, Status `Confirmed` or `Recurring`, viewer listed in
   `Hosted by`). See [`app/lib/host-door-code.ts`](../../app/lib/host-door-code.ts).
   It's computed in the server component, so only those hosts ever receive it.
   Needs the `VERKADA_DAY_USER_ID` env var (same value as the Airtable secret);
   without it nothing is shown.
