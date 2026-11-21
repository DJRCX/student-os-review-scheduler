import { notion, queryAll, requireEnv, text, title, today, addDays, courseNames } from "./notion.js";

const [parent, coursesDb, assignmentsDb, tasksDb] = requireEnv(
  "NOTION_TOKEN",
  "NOTION_PARENT_PAGE_ID",
  "NOTION_COURSES_DB",
  "NOTION_ASSIGNMENTS_DB",
  "NOTION_TASKS_DB",
);
const DIGEST_TITLE = "📅 Due this week";
const COVER = "https://www.notion.so/images/page-cover/gradients_10.jpg";
const COLORS = ["blue", "purple", "orange", "green", "pink", "brown", "red", "yellow"];
const t = today();
const horizon = addDays(t, 7);
const names = await courseNames(coursesDb);
const courseColor = new Map([...names.keys()].map((id, i) => [id, COLORS[i % COLORS.length]]));

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
  .map(({ p, kind }) => {
    const courseId = p.properties.Course?.relation?.[0]?.id;
    return {
      due: p.properties.Due.date.start.slice(0, 10),
      course: names.get(courseId)?.split(" ")[0] ?? "General",
      color: courseColor.get(courseId) ?? "gray",
      name: title(p),
      kind,
      id: p.id,
    };
  })
  .sort((a, b) => a.due.localeCompare(b.due) || a.course.localeCompare(b.course));

const label = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const KIND_ICON = { Review: "🔁", Quiz: "❓", Midterm: "🚨", Final: "🚨", "Lab Report": "🧪", Project: "🛠️" };
const todo = (i) => ({
  type: "to_do",
  to_do: {
    rich_text: [
      { type: "text", text: { content: `${KIND_ICON[i.kind] ?? "📎"} ` } },
      { type: "text", text: { content: ` ${i.course} ` }, annotations: { bold: true, code: true, color: i.color } },
      { type: "text", text: { content: "  " } },
      { type: "mention", mention: { page: { id: i.id } } },
    ],
  },
});
const heading = (content, color = "default") => ({
  type: "heading_2",
  heading_2: { rich_text: text(content), color },
});
const callout = (emoji, color, rich_text) => ({
  type: "callout",
  callout: { icon: { type: "emoji", emoji }, color, rich_text },
});
const divider = { type: "divider", divider: {} };

const overdue = items.filter((i) => i.due < t);
const upcoming = items.filter((i) => i.due >= t);
const exams = items.filter((i) => ["Midterm", "Final"].includes(i.kind));
const reviews = upcoming.filter((i) => i.kind === "Review").length;
const perCourse = Object.entries(
  upcoming.reduce((m, i) => ((m[i.course] = (m[i.course] ?? 0) + 1), m), {}),
).sort((a, b) => b[1] - a[1]);

const stat = (emoji, color, big, small) =>
  ({
    type: "column",
    column: {
      children: [
        callout(emoji, color, [
          { type: "text", text: { content: `${big}\n` }, annotations: { bold: true } },
          { type: "text", text: { content: small }, annotations: { color: "gray" } },
        ]),
      ],
    },
  });

const blocks = [
  callout("🧭", "blue_background", [
    { type: "text", text: { content: `Week of ${label(t)}` }, annotations: { bold: true } },
    { type: "text", text: { content: ` · refreshed automatically every morning · last run ${t}` }, annotations: { color: "gray" } },
  ]),
  {
    type: "column_list",
    column_list: {
      children: [
        stat("📌", "gray_background", upcoming.length, "due in 7 days"),
        stat("🔁", "green_background", reviews, "reviews"),
        stat("⏰", overdue.length ? "red_background" : "gray_background", overdue.length, "overdue"),
      ],
    },
  },
];
if (perCourse.length)
  blocks.push({
    type: "paragraph",
    paragraph: {
      rich_text: perCourse.flatMap(([c, n]) => [
        { type: "text", text: { content: ` ${c} · ${n} ` }, annotations: { code: true, color: items.find((i) => i.course === c).color } },
        { type: "text", text: { content: "  " } },
      ]),
    },
  });
if (exams.length)
  blocks.push(
    callout("🚨", "red_background", text(`Exam coming up: ${exams.map((e) => `${e.name} (${label(e.due)})`).join(", ")}`)),
  );
blocks.push(divider);
if (overdue.length) blocks.push(heading("⏰ Overdue", "red_background"), ...overdue.map(todo));
for (const day of [...new Set(upcoming.map((i) => i.due))]) {
  const isToday = day === t;
  const isTomorrow = day === addDays(t, 1);
  blocks.push(
    heading(
      isToday ? `🔥 Today · ${label(day)}` : isTomorrow ? `☀️ Tomorrow · ${label(day)}` : `🗓️ ${label(day)}`,
      isToday ? "orange_background" : "default",
    ),
  );
  blocks.push(...upcoming.filter((i) => i.due === day).map(todo));
}
if (!items.length) blocks.push(callout("🎉", "green_background", text("Nothing due this week. Enjoy!")));
blocks.push(divider, {
  type: "paragraph",
  paragraph: {
    rich_text: [
      {
        type: "text",
        text: { content: "Tick a box here or in Tasks to mark it done. It disappears on the next refresh." },
        annotations: { italic: true, color: "gray" },
      },
    ],
  },
});

async function children(id) {
  const all = [];
  let cursor;
  do {
    const res = await notion("GET", `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    all.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return all;
}

const existing = (await children(parent)).filter(
  (b) => b.type === "child_page" && b.child_page.title === DIGEST_TITLE,
);
let digest;
if (existing.length) {
  digest = await notion("PATCH", `/pages/${existing[0].id}`, { cover: { type: "external", external: { url: COVER } } });
  for (const b of await children(digest.id)) await notion("DELETE", `/blocks/${b.id}`);
  for (const dup of existing.slice(1)) await notion("PATCH", `/pages/${dup.id}`, { archived: true });
} else {
  digest = await notion("POST", "/pages", {
    parent: { page_id: parent },
    cover: { type: "external", external: { url: COVER } },
    properties: { title: { title: text(DIGEST_TITLE) } },
  });
}
for (let i = 0; i < blocks.length; i += 100) {
  await notion("PATCH", `/blocks/${digest.id}/children`, { children: blocks.slice(i, i + 100) });
}
console.log(`${upcoming.length} upcoming, ${overdue.length} overdue -> ${digest.url}`);
