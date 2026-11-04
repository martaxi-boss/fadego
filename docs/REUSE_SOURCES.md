# FADEGO Foundation Reuse Sources

## Primary donor

- `LuanPaD/BarberLab@29a907cb234501f8769db6ed4c92b1047f9b9747`
- Apache-2.0
- Selective foundation reuse only. See `THIRD_PARTY_NOTICES.md`.

## Read-only architectural references

No code was copied from these repositories in FOUNDATION REUSE 001:

- `clawnify/OpenSalon@ab4bfba3619909102ed60743d6162756e3563648`
- `nextacular/nextacular@06bee752a0423faa2ba0217ea2fedd719a52bda9`
- `digitalocean/sea-notes-saas-starter-kit@c9385c6c71fdb69303a5629d88213cbddd3b723b`
- `nextjs/saas-starter@6e33e58b1e553a41fe22e6b941a7229a002de361`
- `timerise-ai/stripe-connect-subscriptions@84d5788e7f0f8b91a0a86cec402244a732b5bc4f`

All references were treated as strict read-only sources.

## UX references reviewed on 2026-10-20

Read-only comparison; no donor implementation copied and no new runtime dependency.

| Source (exact inspected revision) | Useful pattern | FADEGO decision |
| --- | --- | --- |
| [Lumina](https://github.com/effuselabs/lumina/tree/b73cab3b0cd4237aea7f425f250fa6fcdbc6d6a0) | Tenant-scoped booking loop, calendar dates and explicit delivery state | Retain the existing transactional engine and tenant-local calendar calculations; Gmail OAuth remains FADEGO's sender policy. |
| [Pronto](https://github.com/SGrappelli/pronto/tree/771071577480c49a4cec004422744dfbffe24ba5) | Booking calendar, employee colors, clear appointment status | Add independent day/week timeline and stable professional colors; preserve named statuses and selection of real booking details. |
| [TRiM](https://github.com/ArielCNunes/TRiM-FYP/tree/0254170cf2f7a355a3d543b97cbd92b14a26fa3e) | Weekly calendar, barber filtering, personal schedule and breaks | Add a shared weekly view to manager and personal dashboards, preserving server-side staff scope and existing break/holiday booking validation. |
| [Job e Comissões](https://github.com/leorecoa/Job-e-Comiss-es/tree/d1a39d96d6cbd945d2e7bee9d2fa123e74bb1382) | Owner onboarding, explicit invitation acceptance, barber panel | Complete the pending new-owner activation path with short-lived, revocable invitations and self-selected credentials. |

Inspected entry points: each README; Pronto's
`app/(dashboard)/booking/booking-calendar.tsx`; TRiM's
`frontend/src/components/admin/calendar/CalendarGrid.tsx` and
`frontend/src/components/barber/BarberCalendar.tsx`.

FADEGO keeps its own Next.js/Prisma/PostgreSQL architecture, Portuguese UI,
account-free customer bookings and Gmail-per-shop requirement. Donor payment,
SMTP, WhatsApp/SMS and customer-account models are not introduced. Dragging a
booking is deferred: every schedule change continues through the existing
availability validation and protected rescheduling form.
