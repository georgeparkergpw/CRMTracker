# Cloud Endpoint Practice — Opportunity CRM

A lightweight, single-page CRM for tracking opportunities and engagements within the
Cloud Endpoint Practice. Built with plain **HTML, CSS and vanilla JavaScript** —
no database, no backend, no build step. Host it anywhere that can serve static files
(GitHub Pages, Azure Static Web Apps, Azure Storage static websites).

## What it does

- **Dashboard** — stat tiles (total opportunities, active engagements, open actions,
  open risks), a pipeline-by-stage view, upcoming actions and open risks across all
  opportunities.
- **Opportunity list** — searchable, filterable by stage and priority, exportable to CSV.
- **Opportunity editor** — one form per opportunity covering the full engagement lifecycle:

  | Section | Fields |
  |---|---|
  | Customer | Name, Industry, Region, Account Owner, Customer Tier |
  | Engagement | Engagement ID (auto-generated), Project Name, Stage, Priority, Start/End Date |
  | Scope | Objectives, In Scope, Out of Scope, Assumptions, Constraints |
  | Current Environment | Device Count, OS Mix, Existing MDM, Identity Platform, Security Stack |
  | Requirements | Business, Technical, Compliance Needs |
  | Deliverables | Planned Outputs, Documentation, Workshops, Migration Tasks |
  | Risks | Type (Risk / Blocker / Dependency), Description, Mitigation, Status |
  | Actions | Next Step, Owner, Due Date, Status |
  | Meetings | Date, Attendees, Summary, Decisions |
  | Success Metrics | Adoption %, Compliance %, Devices Migrated, Satisfaction |

- **Pipeline stages** follow the practice's typical flow, starting with the scoping call:
  `Scoping Call → Proposal → Statement of Work → In Delivery → Complete`
  (plus `On Hold` and `Lost`). Edit the `STAGES` array at the top of
  [`js/app.js`](js/app.js) to change the pipeline — filters, badges and the dashboard
  all follow it.
- **Light & dark themes** — follows your system preference, with a manual toggle (◐).
- **Sample data** — a "Load sample data" button appears when the CRM is empty, so you
  can explore before entering real opportunities.

## Where the data lives (important)

There is **no database**. All entries are stored in the browser's `localStorage`,
**on the device and browser where they were entered**. That means:

- Data does **not** sync between people, browsers or machines.
- Clearing browser data will delete your entries.

Use the built-in **Export** button regularly to download a JSON backup, and
**Import** to restore or to hand the data to a colleague. **Export CSV** on the
list view produces a spreadsheet-friendly summary of the (filtered) pipeline.

> If multiple people need to update the same data, treat the exported JSON file as
> the source of truth (e.g. keep it in Teams/SharePoint) and import/export around it.

## Hosting

### Option A — GitHub Pages (quickest)

1. Push this repository to GitHub (already done if you're reading this there).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*,
   pick your default branch (e.g. `main`) and the **/ (root)** folder, then **Save**.
4. After a minute the site is live at `https://<username>.github.io/<repo-name>/`.

> If the repository is private, GitHub Pages requires a Pro/Team plan — otherwise
> the page itself is public even though the repo is private. Note that anyone with
> the URL can load the *app*, but they can't see your data (it's only in your browser).

### Option B — Azure Static Web Apps

1. In the Azure portal, create a **Static Web App** (Free tier is fine).
2. Point it at this GitHub repository and branch.
3. Build details: **Build preset** = *Custom*, **App location** = `/`,
   **Output location** = *(leave empty)* — there is no build step.
4. Azure creates a GitHub Actions workflow that deploys on every push.

### Option C — Azure Storage static website

Enable *Static website* on a storage account and upload `index.html`, `css/` and
`js/` to the `$web` container.

## Project structure

```
index.html       app shell, editor form and row templates
css/styles.css   styling + light/dark theme tokens
js/app.js        all behaviour: storage, rendering, import/export
```

No dependencies, no build. To develop locally just open `index.html` in a browser,
or serve the folder (`python3 -m http.server`) for a proper local URL.
