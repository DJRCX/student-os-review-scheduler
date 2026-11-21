import { appendFileSync } from "node:fs";
import { notion, requireEnv, text, today, addDays } from "./notion.js";

const [parent] = requireEnv("NOTION_TOKEN", "NOTION_PARENT_PAGE_ID");

async function createDb(name, icon, properties) {
  const db = await notion("POST", "/databases", {
    parent: { type: "page_id", page_id: parent },
    icon: { type: "emoji", emoji: icon },
    title: text(name),
    is_inline: true,
    properties,
  });
  console.log(`Created ${name}: ${db.id}`);
  return db.id;
}

const courseRelation = (coursesDb) => ({
  relation: { database_id: coursesDb, type: "dual_property", dual_property: {} },
});

const coursesDb = await createDb("Courses", "📚", {
  Name: { title: {} },
  Code: { rich_text: {} },
  Faculty: { rich_text: {} },
  "Exam Date": { date: {} },
});

const assignmentsDb = await createDb("Assignments", "📎", {
  Name: { title: {} },
  Course: courseRelation(coursesDb),
  Due: { date: {} },
  Type: {
    select: {
      options: ["Assignment", "Quiz", "Lab Report", "Midterm", "Final", "Project"].map((name) => ({ name })),
    },
  },
  Status: {
    select: { options: [{ name: "Not started" }, { name: "In progress" }, { name: "Done" }] },
  },
});

const notesDb = await createDb("Notes", "📝", {
  Name: { title: {} },
  Course: courseRelation(coursesDb),
  Date: { date: {} },
  Scheduled: { checkbox: {} },
});

const tasksDb = await createDb("Tasks", "✅", {
  Name: { title: {} },
  Course: courseRelation(coursesDb),
  Due: { date: {} },
  Done: { checkbox: {} },
  "Source Note": {
    relation: { database_id: notesDb, type: "dual_property", dual_property: {} },
  },
});

appendFileSync(
  ".env",
  `\nNOTION_COURSES_DB=${coursesDb}\nNOTION_ASSIGNMENTS_DB=${assignmentsDb}\nNOTION_NOTES_DB=${notesDb}\nNOTION_TASKS_DB=${tasksDb}\n`,
);

if (process.argv.includes("--no-sample")) process.exit(0);

const t = today();
const page = (db, props) => notion("POST", "/pages", { parent: { database_id: db }, properties: props });
const rel = (id) => ({ relation: [{ id }] });
const date = (d) => ({ date: { start: d } });

const courses = {};
for (const [code, name, faculty, exam] of [
  ["SE216", "SE216 Object Oriented Programming", "Dept. of Software Engineering", 9],
  ["STA101", "STA101 Statistics", "Dept. of Mathematics", 12],
  ["SE411", "SE411 Project Management", "Dept. of Software Engineering", 16],
]) {
  const c = await page(coursesDb, {
    Name: { title: text(name) },
    Code: { rich_text: text(code) },
    Faculty: { rich_text: text(faculty) },
    "Exam Date": date(addDays(t, exam)),
  });
  courses[code] = c.id;
}

for (const [name, code, due, type] of [
  ["OOP Lab Report 4: Inheritance", "SE216", 2, "Lab Report"],
  ["Statistics Quiz 3: Probability", "STA101", 4, "Quiz"],
  ["Project Charter & WBS", "SE411", 6, "Assignment"],
  ["SE216 Midterm", "SE216", 9, "Midterm"],
]) {
  await page(assignmentsDb, {
    Name: { title: text(name) },
    Course: rel(courses[code]),
    Due: date(addDays(t, due)),
    Type: { select: { name: type } },
    Status: { select: { name: "Not started" } },
  });
}

for (const [name, code, ago] of [
  ["Lecture 5: Polymorphism & Interfaces", "SE216", 6],
  ["Chapter 4: Probability Distributions", "STA101", 3],
  ["Lecture 3: Project Schedule Management", "SE411", 2],
  ["Lecture 6: Exception Handling", "SE216", 0],
]) {
  await page(notesDb, {
    Name: { title: text(name) },
    Course: rel(courses[code]),
    Date: date(addDays(t, -ago)),
  });
}

console.log("Sample courses, assignments and notes added. Next: npm start");
