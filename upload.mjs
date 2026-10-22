// Upload images from a folder to the house-moodboard Supabase backend, skipping files already on the board.
// usage: SERVICE_KEY=… node upload.mjs <folder> [--dry]
import { readdir, readFile, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

const base = "https://arhqlreztetzllcfpkkq.supabase.co";
const key = process.env.SERVICE_KEY;
const [folder, flag] = process.argv.slice(2);
const dry = flag === "--dry";
const H = { Authorization: `Bearer ${key}`, apikey: key };
const EXT = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif" };
const md5 = (b) => createHash("md5").update(b).digest("hex");
const j = async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); };

// owner = the single passcode account
const users = (await j(await fetch(`${base}/auth/v1/admin/users`, { headers: H }))).users;
const owner = users.find((u) => u.email === "owner@house-moodboard.app")?.id || users[0].id;
console.log("owner", owner, `(${users.length} user(s))`);

// local files, deduped within the folder
const local = [];
const seen = new Map();
for (const name of (await readdir(folder)).sort()) {
  const ext = path.extname(name).toLowerCase();
  if (!EXT[ext]) { console.log("skip (not an image):", name); continue; }
  const buf = await readFile(path.join(folder, name));
  const h = md5(buf);
  if (seen.has(h)) { console.log(`skip (same as ${seen.get(h)}):`, name); continue; }
  seen.set(h, name);
  local.push({ name, ext, type: EXT[ext], buf, h, size: buf.length });
}

// what's already on the board: compare by size first, then by md5 of the stored original
const items = await j(await fetch(`${base}/rest/v1/items?select=id,full_path,thumb_path,remote_url,room&order=created_at.desc`, { headers: H }));
const objects = await j(await fetch(`${base}/storage/v1/object/list/photos`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: owner, limit: 5000 }) }));
console.log(`board: ${items.length} items, ${objects.length} stored files`);
const bySize = new Map();
for (const o of objects) { const s = o.metadata?.size; if (s) (bySize.get(s) || bySize.set(s, []).get(s)).push(o.name); }
const remoteHash = new Map(); // storage name -> md5 (only fetched when sizes match)
const toUpload = [];
for (const f of local) {
  let dup = null;
  for (const name of bySize.get(f.size) || []) {
    if (!remoteHash.has(name)) {
      const r = await fetch(`${base}/storage/v1/object/public/photos/${owner}/${name}`);
      remoteHash.set(name, md5(Buffer.from(await r.arrayBuffer())));
    }
    if (remoteHash.get(name) === f.h) { dup = name; break; }
  }
  if (dup) console.log(`skip (already on board as ${dup}):`, f.name);
  else toUpload.push(f);
}
console.log(`\n${toUpload.length} to upload:`, toUpload.map((f) => f.name).join(", "));
if (dry) process.exit(0);

const tmp = path.join(path.dirname(new URL(import.meta.url).pathname), "thumbs");
execFileSync("mkdir", ["-p", tmp]);
const sipsDims = (p) => {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", p]).toString();
  return { w: +out.match(/pixelWidth: (\d+)/)[1], h: +out.match(/pixelHeight: (\d+)/)[1] };
};
const put = async (p, body, type) => {
  const r = await fetch(`${base}/storage/v1/object/photos/${p}`, { method: "POST", headers: { ...H, "Content-Type": type, "x-upsert": "false", "cache-control": "max-age=31536000" }, body });
  if (!r.ok) throw new Error(`upload ${p}: ${r.status} ${await r.text()}`);
};
const added = [];
for (const f of toUpload) {
  const src = path.join(folder, f.name);
  const id = randomUUID();
  const { w, h } = sipsDims(src);
  const thumbFile = path.join(tmp, `${id}_t.jpg`);
  execFileSync("sips", ["-Z", "800", "-s", "format", "jpeg", "-s", "formatOptions", "85", src, "--out", thumbFile], { stdio: "ignore" });
  const full_path = `${owner}/${id}.${f.ext === ".jpeg" ? "jpg" : f.ext.slice(1)}`, thumb_path = `${owner}/${id}_t.jpg`;
  await put(full_path, f.buf, f.type);
  await put(thumb_path, await readFile(thumbFile), "image/jpeg");
  const row = { id, owner, full_path, thumb_path, w, h, source_id: null, origin_url: null, room: null };
  const [item] = await j(await fetch(`${base}/rest/v1/items`, { method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(row) }));
  added.push(item);
  console.log(`added ${f.name} → ${id} (${w}×${h})`);
}

// Ask the edge function to file each new photo by room (same call the app makes); leave unsorted if AI is off
let aiOff = false;
for (const item of added) {
  if (aiOff) break;
  try {
    const r = await fetch(`${base}/functions/v1/scrape`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ classify: `${base}/storage/v1/object/public/photos/${item.thumb_path}` }) });
    if (r.status === 501) { aiOff = true; console.log("AI off (501): leaving photos unsorted; the app sorts them on next open"); break; }
    const body = await r.json();
    if (!r.ok) { console.log("classify failed", r.status, body); continue; }
    if (body.room) {
      await fetch(`${base}/rest/v1/items?id=eq.${item.id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ room: body.room }) });
      console.log(`  ${item.id} → ${body.room}`);
    }
  } catch (e) { console.log("classify error", e.message); }
}
console.log(`done: ${added.length} added`);
