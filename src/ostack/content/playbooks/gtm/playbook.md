---
id: gtm
name: Go-to-market
summary: Find and qualify leads, send personal first messages, answer replies, follow up and book meetings.
workflows:
  - id: outbound
    skill: ostack-outbound
    summary: Find, qualify and research leads, then write and send first messages.
    schedule: { days: sun-thu, at: "20:00" }
    per_audience: true
  - id: follow-ups
    skill: ostack-follow-ups
    summary: Read replies, answer them, send due follow-ups and book meetings, across every audience.
    schedule:
      - { days: weekdays, every_minutes: 30, from: "06:00", to: "24:00", offset: 7 }
      - { days: weekends, every_minutes: 60, from: "06:00", to: "24:00", offset: 7 }
---
The first ostack playbook. Leads, messages, replies and opt-outs live in the user's own CRM, Airtable, Sheet or CSV, shared by the whole team, so nobody is contacted twice. Each audience is a folder of files (gtm/audiences/<name>/) with its own audience, templates and follow-up timing; outbound runs once per audience and follow-ups covers them all.
