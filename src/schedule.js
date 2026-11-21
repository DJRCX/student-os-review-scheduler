import { notion, queryAll, requireEnv, text, title, addDays } from "./notion.js";

const [notesDb, tasksDb] = requireEnv("NOTION_TOKEN", "NOTION_NOTES_DB", "NOTION_TASKS_DB");
const intervals = (process.env.REVIEW_INTERVALS ?? "1,3,7").split(",").map(Number);

const notes = await queryAll(notesDb, {
  filter: { property: "Scheduled", checkbox: { equals: false } },
});

if (!notes.length) console.log("No new notes to schedule.");

for (const note of notes) {
  const name = title(note);
  const base = note.properties.Date?.date?.start ?? note.created_time;
  const course = note.properties.Course?.relation ?? [];

  for (const [i, days] of intervals.entries()) {
    await notion("POST", "/pages", {
      parent: { database_id: tasksDb },
      properties: {
        Name: { title: text(`Review ${i + 1}/${intervals.length}: ${name}`) },
        Course: { relation: course },
        Due: { date: { start: addDays(base, days) } },
        "Source Note": { relation: [{ id: note.id }] },
      },
    });
  }

  await notion("PATCH", `/pages/${note.id}`, {
    properties: { Scheduled: { checkbox: true } },
  });
  console.log(`Scheduled ${intervals.length} reviews for "${name}" (+${intervals.join("d, +")}d)`);
}
