import { notion, queryAll, requireEnv, text, title, today } from "./notion.js";

const [sourceDb, notesDb, coursesDb] = requireEnv(
  "NOTION_TOKEN",
  "NOTION_SOURCE_DB",
  "NOTION_NOTES_DB",
  "NOTION_COURSES_DB",
);
const sourceProp = process.env.SOURCE_COURSE_PROPERTY ?? "Category";

await notion("PATCH", `/databases/${notesDb}`, { properties: { Source: { url: {} } } });

const courses = new Map();
for (const c of await queryAll(coursesDb)) {
  const code = c.properties.Code?.rich_text?.map((t) => t.plain_text).join("") || title(c).split(" ")[0];
  courses.set(code.toUpperCase(), c.id);
}

async function courseFor(label) {
  const code = label?.match(/^[A-Z]{2,4}\d{3}/i)?.[0]?.toUpperCase();
  if (!code) return [];
  if (!courses.has(code)) {
    const c = await notion("POST", "/pages", {
      parent: { database_id: coursesDb },
      properties: { Name: { title: text(label) }, Code: { rich_text: text(code) } },
    });
    courses.set(code, c.id);
    console.log(`Added course ${label}`);
  }
  return [{ id: courses.get(code) }];
}

const imported = new Set(
  (await queryAll(notesDb)).map((n) => n.properties.Source?.url).filter(Boolean),
);

let count = 0;
for (const page of await queryAll(sourceDb)) {
  if (imported.has(page.url)) continue;
  const name = title(page).trim();
  if (!name) continue;
  const label = page.properties[sourceProp]?.select?.name;
  await notion("POST", "/pages", {
    parent: { database_id: notesDb },
    properties: {
      Name: { title: text(name) },
      Course: { relation: await courseFor(label) },
      Date: { date: { start: today() } },
      Source: { url: page.url },
    },
  });
  console.log(`Imported "${name}"${label ? ` [${label}]` : ""}`);
  count++;
}
console.log(`${count} new notes imported. Next: npm start`);
