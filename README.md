# Student OS Review Scheduler

Spaced-repetition review tasks and a weekly "Due this week" digest for **Notion Student OS**.

## The problem

Students take lecture notes and then never look at them again until the night before the exam. Deadlines are spread across courses, so it's easy to miss a quiz while studying for another subject.

## What it does

- **Review scheduler** (`npm run schedule`): for every new lecture note in the **Notes** database, it creates three review tasks in **Tasks** at +1, +3 and +7 days (configurable). Each task is linked to the same **Course** and back to the source note. The note is then marked `Scheduled` so it's never processed twice.
- **Weekly digest** (`npm run digest`): builds a `📅 Due this week` page that pulls assignments and review tasks due in the next 7 days. Items are grouped by day, overdue items are flagged in red and upcoming exams get a callout. The page is regenerated on each run.
- **Bring your own notes** (`npm run import`): copies lectures from an existing Notion notes database (mine is "Mid Subjects") into **Notes**, mapping its course tag (e.g. `SE216-OOP`) to a **Course** and linking back to the original page. The source database is only read, never changed, and re-running skips notes already imported.
- **One-command setup** (`npm run setup`): creates the four Student OS databases (Courses, Assignments, Notes, Tasks) with relations and sample DIU courses, so you can demo immediately.

## How it uses Notion Student OS

It's built on the Student OS data model from the workshop:

| Database | Key properties | Relations |
|---|---|---|
| Courses | Name, Code, Faculty, Exam Date | |
| Assignments | Name, Due, Type, Status | → Course |
| Notes | Name, Date, Scheduled | → Course |
| Tasks | Name, Due, Done | → Course, → Source Note |

Everything runs through the official Notion REST API (`api.notion.com/v1`) using an internal connection.

## How Devin was used

Devin (via Devin Chat) did the following:

1. Read the hackathon brief and suggested a problem small enough for a one-hour build.
2. Connected to my Notion workspace through the Notion MCP and created the parent page.
3. Wrote all the code in this repo on my laptop through a local-machine connection: the API helper, setup, scheduler and digest.
4. Ran the scripts against my real workspace to check the full flow, then wrote this README and published the repo.

## Run it

Requires Node.js 20.6 or later. There are no dependencies to install.

1. Create an internal connection at https://www.notion.so/profile/integrations and copy its secret.
2. Create a Notion page, open ••• → Connections and add your connection.
3. Configure:
   ```bash
   cp .env.example .env
   # set NOTION_TOKEN and NOTION_PARENT_PAGE_ID (the page ID from its URL)
   ```
4. Run:
   ```bash
   npm run setup   # creates 4 databases + sample data, and saves their IDs to .env
   npm run import  # optional: copy your own notes (set NOTION_SOURCE_DB and share it with the connection)
   npm start       # schedule reviews, then build the digest
   ```

## Runs automatically every day

`.github/workflows/daily.yml` runs `npm run import` and `npm start` every morning at 07:00 (Asia/Dhaka) on GitHub Actions. New notes get review tasks and the digest is refreshed without you running anything. To set it up on your fork, add the values from your `.env` as repository secrets (`gh secret set -f .env`). You can also trigger it by hand from the Actions tab ("Run workflow").

## Test / demo flow

1. Run `npm run setup` and open your page. You should see Courses, Assignments, Notes and Tasks.
2. Run `npm run schedule`. Each sample note gets 3 review tasks, and the notes are ticked `Scheduled`.
3. Add a new note in Notes (pick a Course and a Date), then run `npm run schedule` again. Only the new note is scheduled.
4. Run `npm run digest` and open `📅 Due this week` for the grouped agenda, overdue items and the exam callout.
5. Tick a task's `Done` box or set an assignment to `Done`, then re-run the digest. That item disappears.

Set `REVIEW_INTERVALS=1,3,7,14` in `.env` to change the review spacing.
