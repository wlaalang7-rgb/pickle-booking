# PickleRally Admin Manual

This manual is for authorized staff who manage booking requests, court availability, rates, and promotions.

## 1. Access and account security

Open the staff dashboard at **`/admin.html`** on the deployed website. Sign in with a staff account created by the Supabase project administrator. Public sign-up should remain disabled.

Every account that can sign in to this project can access customer booking details and the staff tools. Give access only to trusted staff, remove accounts when access is no longer needed, and do not share passwords. Sign out from the dashboard when finished, especially on a shared device.

The dashboard uses the configured Supabase project. Before using it, verify that the website points to the intended production or test project.

## 2. Dashboard navigation

The sidebar contains:

| Section | Purpose |
|---|---|
| **Analytics** | Review estimated revenue, booking activity, status counts, court activity, and occupancy. |
| **Bookings** | Search, filter, review, export, create, update, and delete booking requests. |
| **Calendar** | Review a selected date's court schedule and create or remove maintenance/closure blocks. |
| **Courts & rates** | Add, edit, rename, and (where eligible) delete courts; manage rates and photos. |
| **Promo codes** | Create, edit, disable, and delete promotional codes. |

The dashboard checks for booking updates automatically about every five seconds while signed in. Use **Refresh now** to request an immediate update. The list also refreshes when the dashboard tab becomes active again.

## 3. Analytics

Analytics are calculated from booking records and their saved estimates:

- Revenue cards and the revenue chart reflect **estimated booking values**, not payments collected or accounting records.
- Revenue is based on bookings marked **confirmed**. The trend chart groups values by scheduled court date and can include upcoming confirmed bookings.
- Booking activity shows requests created over the selected weekly (7-day), monthly (30-day), or yearly (12-month) period.
- Status, court, booking-volume, occupancy, and average-value panels summarize the records currently loaded by the dashboard. Occupancy is an operational estimate, not a financial or attendance report.

Do not use these estimates as proof of payment. Track payments through the club's separate payment process.

## 4. Manage booking requests

Open **Bookings** to review requests. Each row shows the player, email, court and slot, player count, duration, estimated total, status, and available notes or promo details.

### Find and review a booking

- Use the search field to search by player name, email, court, date, or time.
- Combine the **Booking date**, **Court**, and status tabs (**All**, **Pending**, **Confirmed**, **Cancelled**) to narrow the list.
- The list displays up to 10 rows per page. Use the page controls to move through results.
- Select **Refresh now** if you need to check for a recent submission immediately.

### Change a status

Use the status selector in the booking row:

- **Pending** — request received; awaiting a staff decision.
- **Confirmed** — staff-approved reservation. It appears on the public schedule.
- **Cancelled** — no longer active; its time can be requested again.

When one customer request includes multiple courts, changing the status of one row updates the entire grouped request. Check the related courts before changing it.

### Create a staff booking

1. From **Analytics**, select **New booking**.
2. Enter the player's name and email, number of players, duration, one or more courts, date, and available time.
3. Optionally apply a promo code, then review the estimate.
4. Select **Save booking**.

A staff-created booking is saved as **confirmed**. The system checks current availability and sends the player a booking reference email. If the email cannot be sent, the booking is still saved; keep the reference displayed by the dashboard and contact the player through the club's normal process.

### Delete a booking

Use the delete control only when deletion is appropriate. The dashboard asks for confirmation because deletion cannot be undone. Deleting a grouped request removes all courts in that request. Prefer changing the status to **Cancelled** when you need to retain the booking record for history or reporting.

## 5. Calendar and maintenance/closure blocks

Open **Calendar**, navigate to the month, and select a date to see its schedule. Use the court filter to focus on one court. The schedule distinguishes active bookings, available hours, and blocked time; pending and confirmed bookings are treated as unavailable.

To create a block:

1. Select the affected date.
2. Choose **Whole club** or **Selected courts**. For selected courts, choose at least one.
3. Choose **Maintenance** or **Club closed**.
4. Set a start and end time, or select **All day**.
5. Enter a reason (for example, court repair or a private event), then select **Block time** or **Block all day**.

Blocks apply to new requests and are shown in the public availability information. A block cannot overlap an active pending or confirmed booking or another overlapping block. Move/cancel conflicting bookings first. To reopen time, select **Remove** next to the relevant block and confirm; customers can request that time again.

## 6. Courts and rates

In **Courts & rates**, use the add form to create a court or edit a court's name, day rate, night rate, and photo. Save edits with **Save changes**. Court names must be 2–60 characters and unique; rates must be whole amounts from **₱1 to ₱100,000 per hour**.

- Day pricing applies when a booking starts before **5:00 PM**.
- Night pricing applies when it starts at or after **5:00 PM**. One rate is used for every hour in that booking.
- Rates changed here affect new booking estimates. Existing booking totals are retained.
- Court photos may be JPG, PNG, or WebP up to **5 MB**.
- A court with booking history cannot be deleted. At least one court must remain.
- Renaming a court updates its current references throughout the system; historical booking totals do not change.

Confirm the displayed rates and spelling before saving, as changes appear on the public booking page.

## 7. Promo codes

In **Promo codes**:

1. Select **Generate code**.
2. Choose **Percentage** (1–99%) or **Fixed amount** (₱1–₱100,000).
3. Optionally set an expiry in Philippine time and a maximum number of redemptions (1–1,000,000). Leave either field blank for no limit.
4. Select **Add promo code**.

Use each row's controls to edit its discount, expiry, redemption limit, and active state, or delete the code. Deactivate a code to prevent future use while retaining the code record.

Each customer may redeem a code once per email address. A multi-court request counts as one redemption, with the discount applied once to the combined estimate. A redemption is recorded when the booking request is saved; cancelling or deleting that booking does not restore the redemption. Existing bookings keep their saved totals and discount values if the code is later edited or deleted.

## 8. Export booking data

From **Bookings**, select **Export CSV** or **Export Excel**. Exports include all loaded booking records, not only the rows matching the current search, filters, or page. The files include personal data such as names, email addresses, notes, booking details, and statuses.

Store exports only in approved locations, share them only with staff who need them, and remove temporary copies when no longer required. The export feature is not a database backup.

## 9. System administration and deployment

The website is static; booking records, access control, rates, promotions, and availability are managed by Supabase. Email references are sent by the Supabase Edge Function through Brevo.

For a new deployment or database migration:

1. Set the Supabase project URL and public **anon** key in `public/js/supabase-config.js`. This browser key is public; database security must come from the configured row-level security policies. **Never place a service-role key or Brevo API key in website files.**
2. Review and apply the current `supabase/schema.sql` in the intended Supabase project's SQL Editor. It creates or updates the required tables, policies, functions, and booking protections.
3. In Supabase Authentication, disable public sign-ups and create staff users deliberately.
4. Configure the Edge Function secrets `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, and `PUBLIC_SITE_URL`. Verify the sender in Brevo.
5. Deploy `send-booking-reference-email` and test a booking, staff sign-in, status update, cancellation, and email delivery before launch.
6. Serve the `public/` directory over HTTP(S); configure the deployed origin in Supabase Auth as needed. For Cloudflare Pages, the output directory is `public` and no build command is required.

The public booking RPC allows up to five successful requests per hour and ten per 24 hours for one email, plus ten per hour and thirty per 24 hours from one IP. The IP is read from Supabase's forwarded request header and stored as a keyed hash in a private schema. People sharing a network share that IP limit. This slows repeated submissions; it does not replace CAPTCHA or bot detection.

Follow the detailed [Supabase setup](./SUPABASE-SETUP.md), [Brevo setup](./BREVO-SETUP.md), and project [README](../README.md). Use a separate Supabase project for testing so test records and configuration do not affect production.

## 10. Troubleshooting

| Problem | Recommended action |
|---|---|
| Sign-in fails or returns to the login screen | Confirm the account exists in the configured Supabase project, check its credentials, and verify that the website's Supabase URL/key point to that same project. Sign in again after correcting configuration. |
| Dashboard reports missing tables, columns, RPC functions, or permission errors | Apply the latest `supabase/schema.sql` as the project owner. If new functions are not visible, run `NOTIFY pgrst, 'reload schema';` in the Supabase SQL Editor, then sign out and back in. |
| Public courts, rates, or available times fail to load | Check Supabase configuration and connectivity; verify that the schema has been applied. Do not treat an unverified time as available. |
| A booking or block is rejected as overlapping | Refresh the calendar and review active bookings and blocks. Choose a different time or resolve the conflicting booking before blocking it. |
| Booking is saved but the email is missing | Check the Edge Function deployment, Brevo API key, verified sender, and `PUBLIC_SITE_URL` secrets. Preserve the booking reference and avoid resubmitting the request. |
| Court photo upload fails | Verify staff sign-in, HTTPS, the `court-images` Storage bucket, and the JPG/PNG/WebP type and 5 MB limit. |
| Promo code cannot be applied | Check that it is active, not expired, within its redemption limit, and unused with the player's email address. |

For customer-facing issues, use the [User Guide](./USER-GUIDE.md) and follow the club's normal support process.
