const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(", ")}. Run \`npm run setup\` first.`);
    process.exit(1);
  }
  return names.slice(1).map((n) => process.env[n]);
}

export async function notion(method, path, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data.message}`);
    return data;
  }
  throw new Error(`${method} ${path} -> rate limited`);
}

export async function queryAll(databaseId, body = {}) {
  const results = [];
  let cursor;
  do {
    const page = await notion("POST", `/databases/${databaseId}/query`, {
      ...body,
      start_cursor: cursor,
    });
    results.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return results;
}

export const text = (content) => [{ type: "text", text: { content } }];
export const title = (page, prop = "Name") =>
  page.properties[prop]?.title?.map((t) => t.plain_text).join("") ?? "";

export function today() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function courseNames(coursesDb) {
  const map = new Map();
  for (const c of await queryAll(coursesDb)) map.set(c.id, title(c));
  return map;
}
