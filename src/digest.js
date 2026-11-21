import { notion, queryAll, requireEnv, text, title, today, addDays, courseNames } from "./notion.js";

const [parent, coursesDb, assignmentsDb, tasksDb] = requireEnv(
  "NOTION_TOKEN",
  "NOTION_PARENT_PAGE_ID",
  "NOTION_COURSES_DB",
  "NOTION_ASSIGNMENTS_DB",
  "NOTION_TASKS_DB",
);
const DIGEST_TITLE = "📅 Due this week";
const t = today();
const horizon = addDays(t, 7);
const names = await courseNames(coursesDb);

const assignments = await queryAll(assignmentsDb, {
  filter: {
    and: [
      { property: "Due", date: { on_or_before: horizon } },
      { property: "Status", select: { does_not_equal: "Done" } },
    ],
  },
});
const tasks = await queryAll(tasksDb, {
  filter: {
    and: [
      { property: "Due", date: { on_or_before: horizon } },
      { property: "Done", checkbox: { equals: false } },
    ],
  },
});

const items = [
  ...assignments.map((p) => ({ p, kind: p.properties.Type?.select?.name ?? "Assignment" })),
  ...tasks.map((p) => ({ p, kind: "Review" })),
]
  .map(({ p, kind }) => ({
    due: p.properties.Due.date.start.slice(0, 10),
    course: names.get(p.properties.Course?.relation?.[0]?.id)?.split(" ")[0] ?? "—",
    name: title(p),
    kind,
    id: p.id,
  }))
  .sort((a, b) => a.due.localeCompare(b.due));

const label = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const todo = (i) => ({
  type: "to_do",
  to_do: {
    rich_text: [
      { type: "text", text: { content: `[${i.course}] ` }, annotations: { bold: true } },
      { type: "mention", mention: { page: { id: i.id } } },
      { type: "text", text: { content: ` · ${i.kind}` }, annotations: { color: "gray" } },
    ],
  },
});
const heading = (content, color = "default") => ({
  type: "heading_3",
  heading_3: { rich_text: text(content), color },
});

const overdue = items.filter((i) => i.due < t);
const upcoming = items.filter((i) => i.due >= t);
const exams = items.filter((i) => ["Midterm", "Final"].includes(i.kind));

const blocks = [
  {
    type: "callout",
    callout: {
      icon: { type: "emoji", emoji: "🧭" },
      rich_text: text(
        `${upcoming.length} items due in the next 7 days · ${overdue.length} overdue · generated ${t}`,
      ),
    },
  },
];
if (exams.length)
  blocks.push({
    type: "callout",
    callout: {
      icon: { type: "emoji", emoji: "🚨" },
      color: "red_background",
      rich_text: text(`Exam this week: ${exams.map((e) => `${e.name} (${label(e.due)})`).join(", ")}`),
    },
  });
if (overdue.length) blocks.push(heading("Overdue", "red"), ...overdue.map(todo));
for (const day of [...new Set(upcoming.map((i) => i.due))]) {
  blocks.push(heading(day === t ? `Today · ${label(day)}` : label(day)));
  blocks.push(...upcoming.filter((i) => i.due === day).map(todo));
}
if (!items.length) blocks.push({ type: "paragraph", paragraph: { rich_text: text("Nothing due. Enjoy the week!") } });

const children = await notion("GET", `/blocks/${parent}/children?page_size=100`);
for (const b of children.results) {
  if (b.type === "child_page" && b.child_page.title === DIGEST_TITLE) {
    await notion("PATCH", `/pages/${b.id}`, { archived: true });
  }
}

const digest = await notion("POST", "/pages", {
  parent: { page_id: parent },
  properties: { title: { title: text(DIGEST_TITLE) } },
  children: blocks.slice(0, 100),
});
for (let i = 100; i < blocks.length; i += 100) {
  await notion("PATCH", `/blocks/${digest.id}/children`, { children: blocks.slice(i, i + 100) });
}
console.log(`${upcoming.length} upcoming, ${overdue.length} overdue -> ${digest.url}`);
