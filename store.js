// Data layer. Two backends with the same interface:
//   cloud — Supabase (Postgres + Storage + the `scrape` Edge Function)
//   local — IndexedDB in this browser, used when config.js has no Supabase keys

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// Free preview API, used when the scraper is unavailable or a site blocks it (e.g. realestate.com.au)
async function microlink(url) {
  const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
  const body = await res.json();
  if (body.status !== "success") throw new Error(body.message || "Could not read that link");
  const d = body.data;
  const image = d.image?.url || null;
  const site = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  // "A Beginner's Guide to Green Walls - realestate.com.au" → drop the site-name suffix
  const title = (d.title || "").replace(/\s+[-|–—]\s+([^-|–—]{2,40})$/, (m, tail) => (tail.toLowerCase().includes(site) ? "" : m));
  return { url: d.url || url, title: title || new URL(url).hostname, description: d.description || "", image, images: image ? [image] : [], others: [], limited: true };
}

// What a pasted link becomes when no AI is available
async function basicAnalyze(url) {
  const page = await microlink(url);
  return { ...page, kind: "idea", summary: page.description, room: "other", tags: [], picked: page.images };
}

export async function createStore(config) {
  return config.supabaseUrl && config.supabaseAnonKey ? cloudStore(config) : localStore();
}

/* ---------------- cloud ---------------- */

async function cloudStore({ supabaseUrl, supabaseAnonKey }) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const sb = createClient(supabaseUrl, supabaseAnonKey);
  const base = supabaseUrl.replace(/\/$/, "");
  const fn = `${base}/functions/v1/scrape`;
  const publicUrl = (path) => `${base}/storage/v1/object/public/photos/${path}`;
  const { data: { session } } = await sb.auth.getSession();
  let user = session?.user || null;

  const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const authHeaders = async () => {
    const { data: { session } } = await sb.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, apikey: supabaseAnonKey };
  };

  return {
    mode: "cloud",
    get user() { return user; },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => { user = s?.user || null; cb(user); }); },
    async signIn(email, password) { user = check(await sb.auth.signInWithPassword({ email, password })).user; },
    async signUp(email, password) {
      const d = check(await sb.auth.signUp({ email, password }));
      if (!d.session) throw new Error("Check your email to confirm the account, then sign in.");
      user = d.user;
    },
    async signOut() { await sb.auth.signOut(); user = null; },

    async load() {
      const [items, properties] = await Promise.all([
        sb.from("items").select("*").order("created_at", { ascending: false }).then(check),
        sb.from("properties").select("*").order("created_at", { ascending: false }).then(check),
      ]);
      return { items, properties };
    },
    src(item, size = "thumb") {
      const path = size === "thumb" ? item.thumb_path || item.full_path : item.full_path || item.thumb_path;
      return path ? publicUrl(path) : item.remote_url;
    },

    async addProperty(p) { return check(await sb.from("properties").insert(p).select().single()); },
    async updateProperty(id, patch) { return check(await sb.from("properties").update(patch).eq("id", id).select().single()); },
    async deleteProperty(p, items) {
      await removeFiles(items);
      check(await sb.from("properties").delete().eq("id", p.id)); // items cascade
    },

    async addPhoto({ full, thumb, ...row }) {
      const id = uuid();
      const full_path = `${user.id}/${id}.jpg`, thumb_path = `${user.id}/${id}_t.jpg`;
      const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
      await Promise.all([
        sb.storage.from("photos").upload(full_path, full, opts).then(check),
        sb.storage.from("photos").upload(thumb_path, thumb, opts).then(check),
      ]);
      return check(await sb.from("items").insert({ id, full_path, thumb_path, ...row }).select().single());
    },
    async addRemotePhoto(row) { return check(await sb.from("items").insert(row).select().single()); },
    async updateItem(id, patch) { return check(await sb.from("items").update(patch).eq("id", id).select().single()); },
    async deleteItem(item) {
      await removeFiles([item]);
      check(await sb.from("items").delete().eq("id", item.id));
    },
    async deleteItems(items) {
      await removeFiles(items);
      check(await sb.from("items").delete().in("id", items.map((i) => i.id)));
    },

    async scrape(url) {
      try {
        const res = await fetch(`${fn}?url=${encodeURIComponent(url)}`, { headers: await authHeaders() });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || res.statusText);
        if (body.images.length) return body;
        return { ...body, ...(await microlink(url).catch(() => ({}))), images: body.images };
      } catch (e) {
        console.warn("scrape failed, falling back to preview", e);
        return microlink(url);
      }
    },
    async analyze(url) {
      try {
        const res = await fetch(fn, {
          method: "POST",
          headers: { ...(await authHeaders()), "Content-Type": "application/json" },
          body: JSON.stringify({ analyze: url }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || res.statusText);
        return body;
      } catch (e) {
        console.warn("analyze failed, falling back to preview", e);
        return basicAnalyze(url);
      }
    },
    async fetchImage(url) {
      const res = await fetch(`${fn}?img=${encodeURIComponent(url)}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error(`Image download failed (${res.status})`);
      return res.blob();
    },
    async classify(item) {
      const url = this.src(item, "thumb");
      if (!url) return null;
      const res = await fetch(fn, {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ classify: url }),
      });
      const body = await res.json();
      if (res.status === 501) return null; // no API key configured — AI tagging is optional
      if (!res.ok) throw new Error(body.error || res.statusText);
      return body;
    },
  };

  async function removeFiles(items) {
    const paths = items.flatMap((i) => [i.full_path, i.thumb_path]).filter(Boolean);
    if (paths.length) await sb.storage.from("photos").remove(paths);
  }
}

/* ---------------- local (IndexedDB) ---------------- */

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("moodboard", 1);
    req.onupgradeneeded = () => {
      for (const name of ["items", "properties", "blobs"]) req.result.createObjectStore(name, { keyPath: "id" });
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
  const urls = new Map(); // blob id -> object URL
  const byDate = (a, b) => b.created_at.localeCompare(a.created_at);

  const blobs = await all("blobs");
  for (const b of blobs) urls.set(b.id, URL.createObjectURL(b.blob));

  const rowDefaults = { note: "", tags: [], features: [], palette: [], room: null, style: null, fav: false, property_id: null };

  return {
    mode: "local",
    user: { id: "local", email: "this browser" },
    onAuth() {},
    async load() {
      return { items: (await all("items")).sort(byDate), properties: (await all("properties")).sort(byDate) };
    },
    src(item, size = "thumb") {
      const key = size === "thumb" ? item.thumb_path || item.full_path : item.full_path || item.thumb_path;
      return (key && urls.get(key)) || item.remote_url;
    },
    async addProperty(p) {
      return put("properties", { id: uuid(), created_at: now(), note: "", description: "", kind: "listing", summary: "", room: null, tags: [], ...p });
    },
    async updateProperty(id, patch) {
      const p = (await all("properties")).find((x) => x.id === id);
      return put("properties", { ...p, ...patch });
    },
    async deleteProperty(p, items) {
      for (const i of items) await this.deleteItem(i);
      await del("properties", p.id);
    },
    async addPhoto({ full, thumb, ...row }) {
      const id = uuid();
      const full_path = `${id}`, thumb_path = `${id}_t`;
      await put("blobs", { id: full_path, blob: full });
      await put("blobs", { id: thumb_path, blob: thumb });
      urls.set(full_path, URL.createObjectURL(full));
      urls.set(thumb_path, URL.createObjectURL(thumb));
      return put("items", { ...rowDefaults, id, created_at: now(), full_path, thumb_path, ...row });
    },
    async addRemotePhoto(row) { return put("items", { ...rowDefaults, id: uuid(), created_at: now(), ...row }); },
    async updateItem(id, patch) {
      const i = (await all("items")).find((x) => x.id === id);
      return put("items", { ...i, ...patch });
    },
    async deleteItem(item) {
      for (const k of [item.full_path, item.thumb_path].filter(Boolean)) {
        await del("blobs", k);
        URL.revokeObjectURL(urls.get(k));
        urls.delete(k);
      }
      await del("items", item.id);
    },
    async deleteItems(items) { for (const i of items) await this.deleteItem(i); },
    scrape: microlink,
    analyze: basicAnalyze,
    async fetchImage(url) {
      const res = await fetch(url, { mode: "cors" }); // works only if the image host allows CORS
      if (!res.ok) throw new Error(res.statusText);
      return res.blob();
    },
    async classify() { return null; },
  };
}
