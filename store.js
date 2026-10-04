// Data layer. Two backends with the same interface:
//   cloud — Supabase (Postgres + Storage + the `scrape` Edge Function)
//   local — IndexedDB in this browser, used when config.js has no Supabase keys

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// What a pasted link becomes without the backend: title, description and cover image from a free preview API
async function preview(url) {
  const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
  const body = await res.json();
  if (body.status !== "success") throw new Error(body.message || "Could not read that link");
  const d = body.data;
  const site = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  // "A Beginner's Guide to Green Walls - realestate.com.au" → drop the site-name suffix
  const title = (d.title || "").replace(/\s+[-|–—]\s+([^-|–—]{2,40})$/, (m, tail) => (tail.toLowerCase().includes(site) ? "" : m));
  const images = d.image?.url ? [d.image.url] : [];
  return { url: d.url || url, title: title || new URL(url).hostname, summary: d.description || "", kind: "idea", room: "other", images, picked: images };
}

// file extension for each image type a browser shows natively (originals are stored as they are)
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" };

export async function createStore(config) {
  return config.supabaseUrl && config.supabaseAnonKey ? cloudStore(config) : localStore();
}

/* ---------------- cloud ---------------- */

async function cloudStore({ supabaseUrl, supabaseAnonKey }) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const sb = createClient(supabaseUrl, supabaseAnonKey);
  const base = supabaseUrl.replace(/\/$/, "");
  const fn = `${base}/functions/v1/scrape`;
  const { data: { session } } = await sb.auth.getSession();
  let user = session?.user || null;

  const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const authHeaders = async () => {
    const { data: { session } } = await sb.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, apikey: supabaseAnonKey };
  };
  const post = async (body) => fetch(fn, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    mode: "cloud",
    get user() { return user; },
    async signIn(email, password) { user = check(await sb.auth.signInWithPassword({ email, password })).user; },
    // Passcode sign-in: one fixed account, the 4-digit code as (part of) its password, so the code itself is never in
    // the site's files. The first code ever entered on a fresh backend creates the account; once it exists (and new
    // sign-ups are switched off in Supabase) any other code just fails.
    async unlock(pin) {
      const email = "owner@house-moodboard.app", password = `house-moodboard-${pin}`;
      const tried = await sb.auth.signInWithPassword({ email, password });
      if (!tried.error) { user = tried.data.user; return; }
      const made = await sb.auth.signUp({ email, password });
      if (made.error || !made.data.session) throw new Error("Wrong passcode");
      user = made.data.user;
    },
    async signUp(email, password) {
      const d = check(await sb.auth.signUp({ email, password }));
      if (!d.session) throw new Error("Check your email to confirm the account, then sign in.");
      user = d.user;
    },

    async load() {
      const [items, sources, comments] = await Promise.all([
        sb.from("items").select("*").order("created_at", { ascending: false }).then(check),
        sb.from("sources").select("*").order("created_at", { ascending: false }).then(check),
        sb.from("comments").select("*").order("created_at", { ascending: true }).then(check),
      ]);
      return { items, sources, comments };
    },
    src(item, size = "thumb") {
      const path = size === "thumb" ? item.thumb_path || item.full_path : item.full_path || item.thumb_path;
      return path ? `${base}/storage/v1/object/public/photos/${path}` : item.remote_url;
    },

    async addSource(row) { return check(await sb.from("sources").insert(row).select().single()); },
    async deleteSource(id) { check(await sb.from("sources").delete().eq("id", id)); },
    async updateSource(id, patch) { return check(await sb.from("sources").update(patch).eq("id", id).select().single()); },
    async addPhoto({ full, thumb, ...row }) {
      const id = uuid();
      // the full copy is the original file, so it keeps its own format (and extension)
      const full_path = `${user.id}/${id}.${EXT[full.type] || "jpg"}`, thumb_path = `${user.id}/${id}_t.jpg`;
      const opts = (type) => ({ contentType: type, cacheControl: "31536000", upsert: false });
      await Promise.all([
        sb.storage.from("photos").upload(full_path, full, opts(full.type || "image/jpeg")).then(check),
        sb.storage.from("photos").upload(thumb_path, thumb, opts("image/jpeg")).then(check),
      ]);
      return check(await sb.from("items").insert({ id, full_path, thumb_path, ...row }).select().single());
    },
    async addRemotePhoto(row) { return check(await sb.from("items").insert(row).select().single()); },
    async addComment(item_id, body) { return check(await sb.from("comments").insert({ item_id, body }).select().single()); },
    async deleteComment(id) { check(await sb.from("comments").delete().eq("id", id)); },
    async updateItem(id, patch) { return check(await sb.from("items").update(patch).eq("id", id).select().single()); },
    async deleteItems(items) {
      const paths = items.flatMap((i) => [i.full_path, i.thumb_path]).filter(Boolean);
      if (paths.length) await sb.storage.from("photos").remove(paths);
      check(await sb.from("items").delete().in("id", items.map((i) => i.id)));
    },

    async analyze(url, { art = false } = {}) {
      try {
        const res = await post({ analyze: url, art });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || res.statusText);
        return body;
      } catch (e) {
        console.warn("analyze failed, falling back to preview", e);
        return preview(url);
      }
    },
    async fetchImage(url) {
      const res = await fetch(`${fn}?img=${encodeURIComponent(url)}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error(`Image download failed (${res.status})`);
      return res.blob();
    },
    // Room for one photo, or null when AI is switched off (no key / no credit)
    async classify(item) {
      const res = await post({ classify: this.src(item, "thumb") });
      const body = await res.json();
      if (res.status === 501) return null;
      if (!res.ok) throw new Error(body.error || res.statusText);
      return body.room;
    },
  };
}

/* ---------------- local (IndexedDB) ---------------- */

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("moodboard", 3);
    req.onupgradeneeded = (e) => {
      const db = req.result, tx = req.transaction;
      for (const name of ["items", "sources", "blobs", "comments"]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
      if (e.oldVersion === 1) { // v1 called sources "properties"
        tx.objectStore("properties").getAll().onsuccess = (ev) => {
          for (const p of ev.target.result) tx.objectStore("sources").put({ ...p, summary: p.summary || p.description || "" });
        };
        tx.objectStore("items").openCursor().onsuccess = (ev) => {
          const c = ev.target.result;
          if (!c) return;
          const { property_id, source_url, ...rest } = c.value;
          c.update({ ...rest, source_id: property_id ?? null, origin_url: source_url ?? null });
          c.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function localStore() {
  const db = await idb();
  const tx = (store, mode, fn) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
  const all = (s) => tx(s, "readonly", (o) => o.getAll());
  const put = (s, v) => tx(s, "readwrite", (o) => o.put(v)).then(() => v);
  const del = (s, id) => tx(s, "readwrite", (o) => o.delete(id));
  const byDate = (a, b) => b.created_at.localeCompare(a.created_at);
  const urls = new Map(); // blob id -> object URL
  for (const b of await all("blobs")) urls.set(b.id, URL.createObjectURL(b.blob));

  return {
    mode: "local",
    user: { id: "local" },
    async load() {
      return { items: (await all("items")).sort(byDate), sources: (await all("sources")).sort(byDate), comments: (await all("comments")).sort((a, b) => -byDate(a, b)) };
    },
    src(item, size = "thumb") {
      const key = size === "thumb" ? item.thumb_path || item.full_path : item.full_path || item.thumb_path;
      return (key && urls.get(key)) || item.remote_url;
    },
    async addSource(row) { return put("sources", { id: uuid(), created_at: now(), ...row }); },
    async deleteSource(id) { await del("sources", id); },
    async updateSource(id, patch) {
      const source = (await all("sources")).find((x) => x.id === id);
      return put("sources", { ...source, ...patch });
    },
    async addPhoto({ full, thumb, ...row }) {
      const id = uuid();
      const full_path = id, thumb_path = `${id}_t`;
      await put("blobs", { id: full_path, blob: full });
      await put("blobs", { id: thumb_path, blob: thumb });
      urls.set(full_path, URL.createObjectURL(full));
      urls.set(thumb_path, URL.createObjectURL(thumb));
      return put("items", { id, created_at: now(), full_path, thumb_path, ...row });
    },
    async addRemotePhoto(row) { return put("items", { id: uuid(), created_at: now(), ...row }); },
    async addComment(item_id, body) { return put("comments", { id: uuid(), created_at: now(), item_id, body }); },
    async deleteComment(id) { await del("comments", id); },
    async updateItem(id, patch) {
      const item = (await all("items")).find((x) => x.id === id);
      return put("items", { ...item, ...patch });
    },
    async deleteItems(items) {
      for (const item of items) {
        for (const k of [item.full_path, item.thumb_path].filter(Boolean)) {
          await del("blobs", k);
          URL.revokeObjectURL(urls.get(k));
          urls.delete(k);
        }
        await del("items", item.id);
        for (const c of (await all("comments")).filter((c) => c.item_id === item.id)) await del("comments", c.id);
      }
    },
    analyze: preview,
    async fetchImage(url) {
      const res = await fetch(url, { mode: "cors" }); // works only if the image host allows CORS
      if (!res.ok) throw new Error(res.statusText);
      return res.blob();
    },
    async classify() { return null; },
  };
}
