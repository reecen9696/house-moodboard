import { config } from "./config.js";
import { createStore } from "./store.js";
import { SEED } from "./seed.js";
import { haptic, installButtonHaptics } from "./haptics.js";

/* ---------------- constants & helpers ---------------- */

const ROOMS = {
  living: "Living", kitchen: "Kitchen", dining: "Dining", bedroom: "Bedroom", bathroom: "Bathroom",
  laundry: "Laundry", study: "Study", hallway: "Hallway", facade: "Facade", garden: "Garden",
  outdoor: "Outdoor", pool: "Pool", floorplan: "Floor plan", other: "Other",
};
const ROW_HEIGHT = [360, 200, 120, 72]; // target row height per zoom level; pinch moves between them
let GAP = 2; // space between photos, read from --gap in styles.css (a hairline on a phone, wider on a desktop)
// A desktop screen gets bigger rows at every zoom level, so photos aren't thumbnails across a wide window
const wide = () => matchMedia("(min-width: 900px)").matches;
const rowHeight = () => ROW_HEIGHT[state.zoom] * (wide() ? 1.5 : 1);
const MAX_AUTO_IMAGES = 6; // photos saved automatically from an article or product page

// Google Material icons (filled)
const svg = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const ICON = {
  home: svg("M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"),
  link: svg("M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"),
  sofa: svg("M21 10c-1.1 0-2 .9-2 2v3H5v-3c0-1.1-.9-2-2-2s-2 .9-2 2v5c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2v-5c0-1.1-.9-2-2-2zm-3-5H6c-1.1 0-2 .9-2 2v2.15c1.16.41 2 1.51 2 2.82V14h12v-2.03c0-1.3.84-2.4 2-2.82V7c0-1.1-.9-2-2-2z"),
  add: svg("M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"),
  close: svg("M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"),
  trash: svg("M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"),
  paste: svg("M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"),
  image: svg("M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"),
  more: svg("M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"),
  go: svg("M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"),
  chat: svg("M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"),
  send: svg("M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"),
  art: svg("M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm5.5 11c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm-3-4c-.83 0-1.5-.67-1.5-1.5S13.67 6 14.5 6s1.5.67 1.5 1.5S15.33 9 14.5 9zM5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S7.33 13 6.5 13 5 12.33 5 11.5zm6-4c0 .83-.67 1.5-1.5 1.5S8 8.33 8 7.5 8.67 6 9.5 6s1.5.67 1.5 1.5z"),
};
// Artwork is its own board (the Art tab): its photos have room "art", which keeps them off Home and Rooms
const ART = "art";
const isArt = (i) => i.room === ART;

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const photos = (n) => `${n} photo${n === 1 ? "" : "s"}`;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const firstUrl = (text) => text?.match(/https?:\/\/\S+/)?.[0]?.replace(/[)\].,'"]+$/, "") || null;
function cleanUrl(u) { // drop tracking junk like utm_source and fbclid
  try {
    const url = new URL(u.trim());
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|igshid|si$|ref$|ref_src)/i.test(k)) url.searchParams.delete(k);
    url.hash = "";
    if (/(^|\.)ebay\./.test(url.hostname) && /^\/itm\//.test(url.pathname)) url.search = ""; // ?itmmeta=…&hash=… is tracking
    return url.href;
  } catch { return u.trim(); }
}
const sameUrl = (a, b) => !!a && !!b && cleanUrl(a).replace(/\/$/, "").toLowerCase() === cleanUrl(b).replace(/\/$/, "").toLowerCase();
// "property-details-21-Heller-Street-Brunswick" → "21 Heller Street Brunswick"
function addressFromUrl(u) {
  try {
    for (let seg of new URL(u).pathname.split("/")) {
      seg = seg.replace(/^property-(?:details|house|unit|apartment|townhouse|villa|land)-/i, "");
      const m = seg.match(/^(\d+[a-z]?(?:-\d+[a-z]?)?)-([a-z]+(?:-[a-z]+)*?)(?:-(?:vic|nsw|qld|wa|sa|tas|act|nt))?(?:-\d{4})?(?:-\d+)?$/i);
      if (m && /[a-z]{3,}/i.test(m[2])) return `${m[1].replace("-", "/")} ${m[2].replace(/-/g, " ")}`.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    }
  } catch { /* not a URL */ }
  return null;
}

/* ---------------- state ---------------- */

const state = {
  items: [],
  sources: [], // pasted links: listings, articles, products
  comments: [], // notes on photos, oldest first
  view: ["home", "rooms", "links", "art"].includes(ls.get("view")) ? ls.get("view") : "home",
  zoom: clamp(ls.get("zoom", 1), 0, ROW_HEIGHT.length - 1),
  selected: null, // Set of item ids while selecting
  armed: false, // bulk delete waiting for its confirming tap
  pending: new Set(), // item ids waiting on AI
  busy: new Set(), // source ids still importing photos
};
let store;
const sourceOf = (item) => state.sources.find((s) => s.id === item.source_id);
const commentsOf = (item) => state.comments.filter((c) => c.item_id === item?.id);
const loaded = new Set(); // image srcs already shown, so re-renders don't flash
window.__l = (img) => { img.classList.add("loaded"); loaded.add(img.getAttribute("src")); };

/* ---------------- layers (browser back closes the top one) ---------------- */

const layers = [];
let skipPop = 0;
function pushLayer(close) { layers.push(close); history.pushState({ layer: layers.length }, ""); }
function popLayer() {
  const close = layers.pop();
  if (!close) return;
  close();
  skipPop++;
  history.back();
}
window.addEventListener("popstate", () => { if (skipPop) skipPop--; else layers.pop()?.(); });

let toastTimer;
function toast(msg, sticky = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

/* ---------------- the wall ---------------- */

// Home is one wall of every photo; Rooms splits it into labelled groups
function sections() {
  const items = state.items.filter((i) => isArt(i) === (state.view === "art"));
  if (state.view === "rooms") {
    return [...Object.keys(ROOMS), ""]
      .map((room) => ({ id: room, title: ROOMS[room] || "Unsorted", items: items.filter((i) => (ROOMS[i.room] ? i.room : "") === room) }))
      .filter((s) => s.items.length);
  }
  return items.length ? [{ id: "all", title: null, items }] : [];
}

// Google Photos-style rows: every photo keeps its shape, every row fills the width
function justify(items, width, target) {
  const ratio = (i) => clamp(i.w && i.h ? i.w / i.h : 1.5, 0.5, 2.5);
  const height = (n, sum) => (width - GAP * (n - 1)) / sum;
  const rows = [];
  let row = [], sum = 0;
  const close = (h, loose = false) => { rows.push({ items: row.map((i) => ({ item: i, ratio: ratio(i) })), h, loose }); row = []; sum = 0; };
  for (const item of items) {
    const r = ratio(item);
    if (row.length) {
      // Would adding this photo squash the row further from the target than leaving it out?
      const without = height(row.length, sum), withIt = height(row.length + 1, sum + r);
      if (withIt < target && without - target < target - withIt) close(without);
    }
    row.push(item);
    sum += r;
    if (height(row.length, sum) <= target) close(height(row.length, sum));
  }
  if (row.length) {
    const h = height(row.length, sum);
    const prev = rows.at(-1);
    const prevSum = prev ? prev.items.reduce((a, x) => a + x.ratio, 0) : 0;
    const merged = prev && height(prev.items.length + row.length, prevSum + sum);
    if (h <= target * 1.6) close(h);
    else if (merged >= target * 0.6) { // fold the stragglers into the row above rather than leave a gap
      prev.items.push(...row.map((i) => ({ item: i, ratio: ratio(i) })));
      prev.h = merged;
    } else close(target * 1.25, true); // too few to fill the width: leave the rest empty
  }
  return rows;
}

function sectionHtml(s, width) {
  const body = justify(s.items, width, rowHeight()).map((row) =>
    `<div class="row" style="height:${row.h.toFixed(2)}px">${row.items.map(({ item, ratio }) => tileHtml(item, ratio, row)).join("")}</div>`).join("");
  if (!s.title) return `<section class="group">${body}</section>`;
  const text = `<b>${esc(s.title)}</b>${state.selected ? "<small>Select all</small>" : ""}`;
  const label = state.selected ? `<button data-act="select-all" data-id="${esc(s.id)}">${text}</button>` : `<span>${text}</span>`;
  return `<section class="group"><div class="label">${label}</div>${body}</section>`;
}

// Links split into houses (listings) and everything else. Older links have no kind saved, so guess from the URL.
const isHouse = (s) => {
  if (s.kind) return s.kind === "listing";
  const path = new URL(s.url).pathname;
  return (/\/(?:property|listing|sale|buy|sold|rent)/i.test(path) && /\d/.test(path)) || !!addressFromUrl(s.url);
};

function linksHtml() {
  if (!state.sources.some((s) => s.kind !== ART)) return `<div class="empty"><b>No links yet</b>Tap + and paste a listing, article or product.</div>`;
  const row = (s) => {
    const first = state.items.find((i) => i.source_id === s.id);
    return `<li>
      <a href="${esc(s.url)}" target="_blank" rel="noopener">
        <span class="thumb">${first ? `<img src="${esc(store.src(first))}" alt="" loading="lazy">` : ICON.link}</span>
        <b>${esc(s.title)}</b>
      </a>
      <button data-act="remove-source" data-id="${esc(s.id)}" aria-label="Remove link">${ICON.close}</button>
    </li>`;
  };
  const group = (title, list) => (list.length ? `<h2 class="links-head">${title}</h2><ul class="links">${list.map(row).join("")}</ul>` : "");
  const sources = state.sources.filter((s) => s.kind !== ART); // those live on the Art tab
  return `<h1 class="title">Links</h1>${group("Houses", sources.filter(isHouse))}${group("Other", sources.filter((s) => !isHouse(s)))}`;
}

function tileHtml(item, ratio, row) {
  const w = ratio * row.h;
  const src = store.src(item, w > 300 ? "full" : "thumb");
  const cls = `tile${state.pending.has(item.id) ? " pending" : ""}${state.selected?.has(item.id) ? " sel" : ""}`;
  const n = commentsOf(item).length;
  return `<button class="${cls}" data-id="${item.id}" style="${row.loose ? `flex:none;width:${w.toFixed(1)}px` : `flex:${ratio.toFixed(4)} 1 0`}">
    <img src="${esc(src)}" alt="" decoding="async" loading="lazy" ${loaded.has(src) ? 'class="loaded"' : 'onload="__l(this)"'} onerror="this.classList.add('loaded')">${n ? `<span class="cbadge">${ICON.chat}${n}</span>` : ""}</button>`;
}

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderNow(); });
}
function renderNow() {
  const view = $("#view"), width = view.clientWidth;
  GAP = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 2;
  view.classList.toggle("selecting", !!state.selected);
  if (state.view === "links") view.innerHTML = linksHtml();
  else {
    const secs = sections(), art = state.view === "art";
    const count = secs.reduce((n, s) => n + s.items.length, 0);
    // Rooms toggle sits on the page (top right) and scrolls away with it
    const toggle = count && !state.selected && !art
      ? `<button class="rooms-toggle${state.view === "rooms" ? " on" : ""}" data-act="view" data-val="${state.view === "rooms" ? "home" : "rooms"}" aria-label="${state.view === "rooms" ? "Show all photos" : "Sort by room"}">${ICON.sofa}</button>` : "";
    // desktop only (styles.css): a title over the board, with the count
    const head = `<header class="dhead"><h1>${art ? "Artwork" : "Moodboard"}</h1><span>${photos(count)}</span></header>`;
    view.innerHTML = head + toggle + (secs.length ? secs.map((s) => sectionHtml(s, width)).join("")
      : art ? `<div class="empty"><b>No artwork yet</b>Tap + and paste a link to a piece (eBay, a gallery, an artist's site).</div>`
      : `<div class="empty"><b>Your mood board is empty</b>Tap + to paste a link or add photos.</div>`);
  }
  renderNav();
}

function renderNav() {
  const sel = state.selected;
  if (!sel) {
    const tab = (val, icon, name) => `<button data-act="view" data-val="${val}" class="${state.view === val ? "on" : ""}" aria-label="${name}">${icon}</button>`;
    $("#nav").innerHTML = `<div class="side"><button data-act="view" data-val="${state.view === "rooms" ? "rooms" : "home"}" class="${["home", "rooms"].includes(state.view) ? "on" : ""}" aria-label="Photos">${ICON.home}</button>${tab("art", ICON.art, "Artwork")}</div>
      <button data-act="add" class="add" aria-label="Add">${ICON.add}</button>
      <div class="side">${tab("links", ICON.link, "Links")}</div>`;
    return;
  }
  const n = sel.size;
  $("#nav").innerHTML = `<button data-act="cancel" class="act" aria-label="Cancel">${ICON.close}</button>
    <span class="count">${n}</span>
    <label class="act${n ? "" : " off"}" aria-label="Move to room">${ICON.sofa}<select data-act="room">
      <option value="" disabled selected>Move to room</option>
      ${Object.entries(ROOMS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
    <button data-act="delete" class="act${state.armed ? " armed" : ""}" aria-label="Delete" ${n ? "" : "disabled"}>${ICON.trash}</button>`;
}

/* ---------------- zoom (pinch, ctrl+wheel, + / −) ---------------- */

function setZoom(z, anchorId) {
  z = clamp(z, 0, ROW_HEIGHT.length - 1);
  if (z === state.zoom) return;
  const top = (id) => id && document.querySelector(`.tile[data-id="${id}"]`)?.getBoundingClientRect().top;
  const before = top(anchorId);
  state.zoom = z;
  ls.set("zoom", z);
  renderNow();
  const after = top(anchorId);
  if (before !== undefined && after !== undefined) $("#main").scrollBy(0, after - before); // keep the pinched photo under your fingers
}

function setupZoom() {
  const main = $("#main"), view = $("#view");
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let pinch = null;
  main.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 2) return;
    const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const r = view.getBoundingClientRect();
    view.style.transformOrigin = `${mx - r.left}px ${my - r.top}px`;
    pinch = { d0: dist(e.touches), scale: 1, anchor: document.elementFromPoint(mx, my)?.closest(".tile")?.dataset.id };
  }, { passive: true });
  main.addEventListener("touchmove", (e) => {
    if (!pinch || e.touches.length !== 2) return;
    pinch.scale = dist(e.touches) / pinch.d0;
    view.style.transform = `scale(${clamp(pinch.scale, 0.5, 2)})`;
  }, { passive: true }); // passive keeps one-finger scrolling off the main thread
  const end = (e) => {
    if (!pinch || e.touches.length >= 2) return;
    const { scale, anchor } = pinch;
    pinch = null;
    view.style.transform = "";
    const steps = scale > 1.15 ? -(scale > 1.7 ? 2 : 1) : scale < 0.87 ? (scale < 0.6 ? 2 : 1) : 0;
    if (steps) setZoom(state.zoom + steps, anchor);
  };
  main.addEventListener("touchend", end);
  main.addEventListener("touchcancel", end);
  document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false }); // stop iOS zooming the page

  let acc = 0, accTimer; // trackpad pinch arrives as ctrl+wheel
  window.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    acc += e.deltaY;
    clearTimeout(accTimer);
    accTimer = setTimeout(() => (acc = 0), 250);
    if (Math.abs(acc) > 40) {
      setZoom(state.zoom + Math.sign(acc), document.elementFromPoint(e.clientX, e.clientY)?.closest(".tile")?.dataset.id);
      acc = 0;
    }
  }, { passive: false });
}

/* ---------------- select & delete ---------------- */

function setSelecting(on, firstId) {
  state.selected = on ? new Set(firstId ? [firstId] : []) : null;
  state.armed = false;
  renderNow();
}
function toggleSelected(id) {
  const sel = state.selected;
  sel.has(id) ? sel.delete(id) : sel.add(id);
  state.armed = false;
  document.querySelector(`.tile[data-id="${id}"]`)?.classList.toggle("sel", sel.has(id));
  renderNav();
}
const selectedItems = () => state.items.filter((i) => state.selected?.has(i.id));

async function deleteItems(items) {
  try {
    await store.deleteItems(items);
    const gone = new Set(items.map((i) => i.id));
    state.items = state.items.filter((i) => !gone.has(i.id));
    state.comments = state.comments.filter((c) => !gone.has(c.item_id)); // the backend drops them with the photo
    // A link whose photos are all deleted goes too
    for (const id of new Set(items.map((i) => i.source_id).filter(Boolean))) {
      if (!state.items.some((i) => i.source_id === id)) await removeSource(id);
    }
    return true;
  } catch (e) {
    toast(`Couldn't delete: ${e.message}`);
    return false;
  } finally {
    render();
  }
}
async function removeSource(id) {
  await store.deleteSource(id);
  state.sources = state.sources.filter((s) => s.id !== id);
}

// Long-press a photo to start selecting, like Google Photos
let suppressClick = false;
function setupLongPress() {
  let timer = null, start = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  document.addEventListener("pointerdown", (e) => {
    const tile = e.target.closest?.("#view .tile");
    if (!tile || state.selected || e.button > 0 || state.view === "links") return;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      timer = null;
      suppressClick = true;
      haptic("hold");
      setSelecting(true, tile.dataset.id);
    }, 450);
  });
  document.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  // The release after a long-press may or may not fire a click (iOS doesn't): ignore it briefly either way
  document.addEventListener("pointerup", () => { cancel(); if (suppressClick) setTimeout(() => (suppressClick = false), 350); });
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest?.(".tile")) e.preventDefault(); });
}

/* ---------------- viewer ---------------- */

const viewer = { list: [], index: 0, open: false, info: false, bare: false };
const currentItem = () => state.items.find((i) => i.id === viewer.list[viewer.index]?.id);

function openViewer(id) {
  viewer.list = sections().flatMap((s) => s.items);
  viewer.index = Math.max(0, viewer.list.findIndex((i) => i.id === id));
  viewer.info = viewer.bare = false;
  drawViewer();
  if (!viewer.open) { viewer.open = true; pushLayer(hideViewer); }
}
function drawViewer() {
  const el = $("#viewer");
  el.innerHTML = `
    <div class="strip">${viewer.list.map((i) => `<div class="slide"><img src="${esc(store.src(i, "full"))}" alt="" loading="lazy" decoding="async" draggable="false"></div>`).join("")}</div>
    <div class="vbar">
      <button class="vbtn" data-v="close" aria-label="Close">${ICON.close}</button>
      <span class="spacer"></span>
      <button class="vbtn trash" data-v="delete" aria-label="Delete">${ICON.trash}</button>
      <button class="vbtn chat" data-v="comments" aria-label="Comments">${ICON.chat}<span class="n"></span></button>
      <button class="vbtn" data-v="info" aria-label="Details">${ICON.more}</button>
    </div>
    <div class="cap"></div>
    <section class="cpanel" aria-label="Comments">
      <div class="chead"><b>Comments</b><button class="vbtn" data-v="cclose" aria-label="Close comments">${ICON.close}</button></div>
      <ul class="clist"></ul>
      <form class="cform"><textarea name="body" rows="1" placeholder="Add a comment…" enterkeyhint="send"></textarea><button aria-label="Post comment">${ICON.send}</button></form>
    </section>`;
  el.hidden = false;
  document.body.style.overflow = "hidden";
  syncChrome();
  const strip = $(".strip", el);
  strip.scrollLeft = viewer.index * strip.clientWidth;
  drawCaption();
  setupComments(el);
  let t;
  strip.addEventListener("scroll", () => {
    clearTimeout(t);
    if (viewer.relayout) return; // a rotation moves the scroll position; that isn't a swipe to another photo
    t = setTimeout(() => {
      const i = Math.round(strip.scrollLeft / strip.clientWidth);
      if (i !== viewer.index) { resetZoom(); viewer.index = i; drawCaption(); drawComments(); }
    }, 60);
  });
  setupPhotoGestures(strip);
}
function hideViewer() {
  viewer.open = false;
  viewer.comments = false;
  $("#viewer").hidden = true;
  $("#viewer").innerHTML = "";
  document.body.style.overflow = "";
}
// Tap the photo to hide/show the buttons; ⋮ shows the details panel
function syncChrome() {
  const el = $("#viewer");
  el.classList.toggle("bare", viewer.bare && !viewer.comments);
  el.classList.toggle("info", viewer.info && !viewer.bare && !viewer.comments);
  el.classList.toggle("talking", !!viewer.comments);
}

/* Comments on a photo: the chat button (right of the bin) or a swipe up on the photo slides the panel up, with the
   history and a box to add one. Saved with the photo in the backend; the panel follows you as you swipe photos. */
function drawComments() {
  const el = $("#viewer");
  if (!el || el.hidden) return;
  const item = currentItem(), list = commentsOf(item);
  const n = $(".chat .n", el);
  if (n) n.textContent = list.length || "";
  const ul = $(".clist", el);
  if (!ul) return;
  const when = (d) => new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  ul.innerHTML = list.length
    ? list.map((c) => `<li><p>${esc(c.body)}</p><small>${esc(when(c.created_at))}</small><button data-v="cdel" data-id="${esc(c.id)}" aria-label="Delete comment">${ICON.close}</button></li>`).join("")
    : `<li class="none">No comments yet</li>`;
  ul.scrollTop = ul.scrollHeight;
}
function openComments(focus = false) {
  if (!viewer.comments) { viewer.comments = true; pushLayer(hideComments); }
  resetZoom(true);
  syncChrome();
  drawComments();
  if (focus) setTimeout(() => $("#viewer .cform textarea")?.focus(), 260);
}
function hideComments() {
  viewer.comments = false;
  $("#viewer .cform textarea")?.blur();
  syncChrome();
}
function setupComments(el) {
  const form = $(".cform", el), box = form.body;
  const grow = () => { box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 120) + "px"; };
  box.addEventListener("input", grow);
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = box.value.trim(), item = currentItem();
    if (!body || !item) return;
    box.value = ""; grow();
    try {
      state.comments.push(await store.addComment(item.id, body));
      haptic("success");
    } catch (err) { box.value = body; toast(`Couldn't save: ${err.message}`); }
    drawComments(); render();
  };
  drawComments();
}
async function deleteComment(btn) {
  if (!btn.classList.contains("armed")) { btn.classList.add("armed"); btn.textContent = "Delete"; return; }
  try {
    await store.deleteComment(btn.dataset.id);
    state.comments = state.comments.filter((c) => c.id !== btn.dataset.id);
  } catch (err) { toast(`Couldn't delete: ${err.message}`); }
  drawComments(); render();
}
function drawCaption() {
  const item = currentItem(), cap = $("#viewer .cap");
  if (!item || !cap) return;
  const s = sourceOf(item);
  const trash = $("#viewer .trash");
  trash.classList.remove("armed");
  trash.innerHTML = ICON.trash;
  cap.innerHTML = `
    ${s ? `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener"><b>${esc(s.title)}</b>${s.width_cm ? `<small class="size">${esc(`${+s.width_cm} × ${+s.height_cm} cm (W × H)`)}</small>` : ""}${s.summary ? `<p>${esc(s.summary)}</p>` : ""}<small>${esc(host(s.url))} ↗</small></a>` : `<div class="src"><b>Your photo</b><small>${esc(new Date(item.created_at).toLocaleDateString())}</small></div>`}
    ${isArt(item) ? "" : `<label class="roompill">${ICON.sofa}${ROOMS[item.room] || (state.pending.has(item.id) ? "Sorting…" : "Room")}
      <select>${ROOMS[item.room] ? "" : `<option value="" disabled selected>Room</option>`}${Object.entries(ROOMS).map(([k, v]) => `<option value="${k}"${item.room === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>`}`;
}
async function onViewerClick(e) {
  const btn = e.target.closest("[data-v]");
  if (!btn) return;
  if (btn.dataset.v === "close") return popLayer();
  if (btn.dataset.v === "info") { viewer.info = !viewer.info; return syncChrome(); }
  if (btn.dataset.v === "comments") return viewer.comments ? popLayer() : openComments(true);
  if (btn.dataset.v === "cclose") return popLayer();
  if (btn.dataset.v === "cdel") return deleteComment(btn);
  if (btn.dataset.v !== "delete") return;
  if (!btn.classList.contains("armed")) { btn.classList.add("armed"); btn.textContent = "Delete?"; return; }
  const item = currentItem();
  if (!item || !(await deleteItems([item]))) return;
  viewer.list = viewer.list.filter((i) => i.id !== item.id);
  if (!viewer.list.length) return popLayer();
  viewer.index = Math.min(viewer.index, viewer.list.length - 1);
  drawViewer();
}

/* Two-finger zoom, drag to pan when zoomed, double-tap to zoom in/out, single tap toggles the buttons */
const pz = { s: 1, x: 0, y: 0 };
const currentImg = () => $("#viewer .strip")?.children[viewer.index]?.querySelector("img");
function applyZoom(animate = false) {
  const img = currentImg(), strip = $("#viewer .strip");
  if (!img) return;
  img.style.transition = animate ? "transform .25s ease" : "none";
  img.style.transform = pz.s === 1 ? "" : `translate(${pz.x}px, ${pz.y}px) scale(${pz.s})`;
  strip.style.overflowX = pz.s > 1 ? "hidden" : ""; // no swiping to the next photo while zoomed
}
function resetZoom(animate = false) { pz.s = 1; pz.x = 0; pz.y = 0; applyZoom(animate); }
// Keep the photo covering the screen instead of drifting off it
function clampPan() {
  const img = currentImg();
  if (!img) return;
  const w = img.clientWidth * pz.s, h = img.clientHeight * pz.s;
  const mx = Math.max(0, (w - innerWidth) / 2), my = Math.max(0, (h - innerHeight) / 2);
  pz.x = clamp(pz.x, -mx, mx);
  pz.y = clamp(pz.y, -my, my);
}

function setupPhotoGestures(strip) {
  const centre = () => ({ x: innerWidth / 2, y: innerHeight / 2 });
  const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let g = null, moved = false, lastTap = 0, tapTimer;

  strip.addEventListener("touchstart", (e) => {
    const c = centre();
    if (e.touches.length === 2) {
      const m = mid(e.touches);
      // the image point under the fingers, so it stays under them while zooming
      g = { kind: "pinch", d0: dist(e.touches), s0: pz.s, px: (m.x - c.x - pz.x) / pz.s, py: (m.y - c.y - pz.y) / pz.s };
      moved = true;
    } else if (e.touches.length === 1) {
      moved = false;
      const t = e.touches[0];
      g = { kind: pz.s > 1 ? "pan" : "tap", x: t.clientX, y: t.clientY, x0: t.clientX - pz.x, y0: t.clientY - pz.y };
    }
  }, { passive: true });

  strip.addEventListener("touchmove", (e) => {
    if (!g) return;
    const c = centre();
    if (g.kind === "pinch" && e.touches.length === 2) {
      e.preventDefault();
      const m = mid(e.touches);
      pz.s = clamp(g.s0 * dist(e.touches) / g.d0, 1, 5);
      pz.x = m.x - c.x - g.px * pz.s;
      pz.y = m.y - c.y - g.py * pz.s;
      applyZoom();
    } else if (g.kind === "pan" && e.touches.length === 1) {
      e.preventDefault();
      if (Math.hypot(e.touches[0].clientX - g.x, e.touches[0].clientY - g.y) > 10) moved = true; // a wobbly tap still counts as a tap
      pz.x = e.touches[0].clientX - g.x0;
      pz.y = e.touches[0].clientY - g.y0;
      clampPan();
      applyZoom();
    } else if (g.kind === "tap" && Math.hypot(e.touches[0].clientX - g.x, e.touches[0].clientY - g.y) > 10) {
      moved = true;
    }
  }, { passive: false });

  strip.addEventListener("touchend", (e) => {
    if (!g || e.touches.length) return;
    const was = g;
    g = null;
    if (was.kind === "pinch") {
      if (pz.s < 1.05) resetZoom(true); else { clampPan(); applyZoom(true); }
      return;
    }
    if (moved) {
      // a swipe up (not a sideways swipe to the next photo) opens the comments
      const t = e.changedTouches[0], dy = was.y - t.clientY, dx = Math.abs(t.clientX - was.x);
      if (was.kind === "tap" && dy > 60 && dx < dy * 0.6) openComments(true);
      return;
    }
    const now = Date.now();
    if (now - lastTap < 280) { // double tap
      clearTimeout(tapTimer);
      lastTap = 0;
      if (pz.s > 1) return resetZoom(true);
      const c = centre(), t = e.changedTouches[0];
      pz.s = 2.5;
      pz.x = -(t.clientX - c.x) * 1.5;
      pz.y = -(t.clientY - c.y) * 1.5;
      clampPan();
      return applyZoom(true);
    }
    lastTap = now;
    tapTimer = setTimeout(() => { viewer.bare = !viewer.bare; syncChrome(); }, 280);
  });

  // Mouse: click toggles the buttons, double-click zooms
  strip.addEventListener("click", (e) => {
    if (e.pointerType === "touch" || e.sourceCapabilities?.firesTouchEvents) return;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { viewer.bare = !viewer.bare; syncChrome(); }, 250);
  });
  strip.addEventListener("dblclick", (e) => {
    clearTimeout(tapTimer);
    if (pz.s > 1) return resetZoom(true);
    pz.s = 2.5;
    pz.x = -(e.clientX - innerWidth / 2) * 1.5;
    pz.y = -(e.clientY - innerHeight / 2) * 1.5;
    clampPan();
    applyZoom(true);
  });
}

/* ---------------- sheet ---------------- */

let sheetOpen = false;
function openSheet(html, mount) {
  const el = $("#sheet");
  el.innerHTML = html;
  el.hidden = false;
  el.scrollTop = 0;
  $("#backdrop").hidden = false;
  if (!sheetOpen) { sheetOpen = true; pushLayer(hideSheet); }
  mount?.(el);
}
function hideSheet() {
  sheetOpen = false;
  $("#sheet").hidden = true;
  $("#sheet").innerHTML = "";
  $("#backdrop").hidden = true;
}
const closeSheet = () => sheetOpen && popLayer();

// On the Art tab, + adds artwork: links go through addArt and uploaded photos are filed as art
let uploadRoom = null;
function openAdd() {
  const art = state.view === "art";
  openSheet(`
    ${art ? `<h3 class="sheet-title">Add artwork</h3>` : ""}
    <div class="choices">
      <button data-s="paste">${ICON.paste}Paste link</button>
      <button data-s="photos">${ICON.image}Photos</button>
    </div>
    <form class="linkform">
      <input name="url" type="url" inputmode="url" placeholder="or type a link" autocomplete="off" required>
      <button aria-label="Add link">${ICON.go}</button>
    </form>`, (el) => {
    el.onclick = async (e) => {
      const s = e.target.closest("[data-s]")?.dataset.s;
      if (s === "photos") { uploadRoom = art ? ART : null; $("#files").click(); closeSheet(); }
      if (s === "paste") {
        const url = firstUrl(await navigator.clipboard?.readText().catch(() => ""));
        if (!url) { toast("No link on your clipboard"); return $("input", el).focus(); }
        closeSheet();
        art ? addArt(url) : addLink(url);
      }
    };
    $("form", el).onsubmit = (e) => {
      e.preventDefault();
      const url = e.target.url.value;
      closeSheet();
      art ? addArt(url) : addLink(url);
    };
  });
}

/* ---------------- adding links ---------------- */

async function addLink(raw) {
  const url = cleanUrl(raw);
  toast("Reading link…", true);
  let page;
  try {
    page = await store.analyze(url);
  } catch (e) {
    return toast(`Couldn't read that link: ${e.message}`);
  }
  $("#toast").hidden = true;
  const existing = state.sources.find((s) => sameUrl(s.url, url) || sameUrl(s.url, page.url));
  if (addressFromUrl(page.url) || addressFromUrl(url)) page.kind = "listing"; // a street address in the URL means a house, AI or not
  if (page.kind === "listing") {
    // Listings are named by address; agents' page titles are usually slogans
    if (!/^\d/.test(page.title)) page.title = addressFromUrl(page.url) || addressFromUrl(url) || page.title;
    if (page.images.length > 1) return pickPhotos(page, existing);
  }
  const urls = (page.picked?.length ? page.picked : page.images.slice(0, 1)).slice(0, MAX_AUTO_IMAGES);
  saveLink(page, existing, urls, ROOMS[page.room] && page.room !== "other" ? page.room : null);
}

// Artwork: every photo on the page comes back; the first (the piece itself) is ticked, tap any others (back, detail, on a wall)
async function addArt(raw) {
  const url = cleanUrl(raw);
  toast("Reading link…", true);
  let page;
  try {
    page = await store.analyze(raw.trim(), { art: true }); // the raw link: an eBay one carries the photo id in its tracking params
  } catch (e) {
    return toast(`Couldn't read that link: ${e.message}`);
  }
  $("#toast").hidden = true;
  if (!page.images.length) return toast(/ebay\./.test(url) ? "eBay wouldn't share the photos. Save one and add it with Photos." : "No pictures found on that page");
  page.kind = ART;
  const existing = state.sources.find((s) => sameUrl(s.url, url) || sameUrl(s.url, page.url));
  if (page.images.length === 1 && !existing) return saveLink(page, null, page.images, ART);
  pickPhotos(page, existing, ART, page.picked?.length ? page.picked.slice(0, 1) : page.images.slice(0, 1));
}

// A listing can have dozens of photos: tap the ones worth keeping
function pickPhotos(page, existing, room = null, preselect = []) {
  const had = new Set(existing ? state.items.filter((i) => i.source_id === existing.id).map((i) => i.origin_url) : []);
  const fresh = page.images.filter((u) => !had.has(u));
  const picked = new Set(preselect.filter((u) => !had.has(u)));
  openSheet(`
    <h3>${esc(existing?.title || page.title)}</h3>
    <p class="sub"><span>Tap the photos you like</span><button data-s="all">Select all</button></p>
    <div class="pick">${page.images.map((u) => `<button data-u="${esc(u)}" class="${had.has(u) ? "had" : ""}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("")}</div>
    <div class="foot"><button class="primary" data-s="add" disabled>Add photos</button></div>`, (el) => {
    const sync = () => {
      for (const b of el.querySelectorAll("[data-u]")) b.classList.toggle("sel", picked.has(b.dataset.u));
      $('[data-s="all"]', el).textContent = picked.size === fresh.length ? "Clear" : "Select all";
      const add = $('[data-s="add"]', el);
      add.disabled = !picked.size;
      add.textContent = picked.size ? `Add ${photos(picked.size)}` : "Add photos";
    };
    el.onclick = (e) => {
      const u = e.target.closest("[data-u]")?.dataset.u;
      const s = e.target.closest("[data-s]")?.dataset.s;
      if (u) picked.has(u) ? picked.delete(u) : picked.add(u);
      if (s === "all") { if (picked.size === fresh.length) picked.clear(); else fresh.forEach((x) => picked.add(x)); }
      if (s === "add") { closeSheet(); return saveLink(page, existing, [...picked], room); }
      sync();
    };
    sync();
  });
}

async function saveLink(page, existing, urls, room) {
  let source = existing;
  try {
    if (!source) {
      source = await store.addSource({ url: cleanUrl(page.url), title: page.title, summary: page.summary || "", kind: ["listing", ART].includes(page.kind) ? page.kind : "other" });
      state.sources.unshift(source);
    }
  } catch (e) {
    return toast(`Couldn't save: ${e.message}`);
  }
  const had = new Set(state.items.filter((i) => i.source_id === source.id).map((i) => i.origin_url));
  state.busy.add(source.id);
  render();
  $("#main").scrollTo({ top: 0, behavior: "smooth" });
  await importImages(urls.filter((u) => !had.has(u)), source.id, () => room);
  state.busy.delete(source.id);
  if (page.size && source.width_cm == null) await saveSize(source, page.size);
  render();
}

// A painting's size (from the backend's size.ts: as the seller wrote it, sides in cm). Saved as width × height the way
// it hangs: the longer side follows the photo's longer side (a near-square photo keeps the seller's order).
async function saveSize(source, { size, a_cm, b_cm }) {
  const photo = state.items.find((i) => i.source_id === source.id && i.w && i.h);
  const [lo, hi] = [Math.min(a_cm, b_cm), Math.max(a_cm, b_cm)];
  const r = photo ? photo.w / photo.h : 1;
  const [width_cm, height_cm] = Math.abs(r - 1) < 0.08 ? [a_cm, b_cm] : r > 1 ? [hi, lo] : [lo, hi];
  try {
    const saved = await store.updateSource(source.id, { size, width_cm, height_cm });
    state.sources = state.sources.map((s) => (s.id === source.id ? saved : s));
  } catch (e) { console.warn("couldn't save size", e); }
}

/* ---------------- photos in ---------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.referrerPolicy = "no-referrer";
    img.src = src;
  });
}
function toJpeg(img, max, quality) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't encode image"))), "image/jpeg", quality));
}
// The full copy is the original file, untouched: no resizing, no re-compression. Only a format a browser can't show
// everywhere (HEIC from an iPhone) is converted, to a full-size 95% JPEG. Plus an 800px thumbnail for the wall.
const KEEP = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
async function processImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const [full, thumb] = await Promise.all([KEEP.includes(blob.type) ? blob : toJpeg(img, 12000, 0.95), toJpeg(img, 800, 0.85)]);
    return { full, thumb, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Runs `add` over the list a few at a time, showing progress
async function addAll(list, limit, add) {
  if (!list.length) return;
  let next = 0, done = 0, failed = 0;
  toast(`Adding ${photos(list.length)}…`, true);
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      try {
        const item = await add(list[next++]);
        state.items.unshift(item);
        if (!item.room) queueClassify(item);
        render();
      } catch (e) { console.warn(e); failed++; }
      toast(`Adding ${++done}/${list.length}…`, true);
    }
  }));
  toast(failed ? `Added ${photos(done - failed)}, ${failed} failed` : `Added ${photos(done)}`);
  if (done > failed) haptic("success");
}

// Copies remote images into storage so they survive the listing coming down; links to the original if that fails
const importImages = (urls, sourceId, roomOf = () => null) => addAll(urls, 3, async (url) => {
  const row = { source_id: sourceId, origin_url: url, room: roomOf(url) };
  try {
    return await store.addPhoto({ ...(await processImage(await store.fetchImage(url))), ...row });
  } catch (e) {
    console.warn("copy failed, linking instead", url, e);
    const img = await loadImage(url);
    return store.addRemotePhoto({ ...row, remote_url: url, w: img.naturalWidth, h: img.naturalHeight });
  }
});
const uploadFiles = (files, room = null) => addAll(files, 2, async (file) => store.addPhoto({ ...(await processImage(file)), source_id: null, origin_url: null, room }));

/* ---------------- AI room sorting ---------------- */

const aiQueue = [];
let aiRunning = 0, aiOff = false;
function queueClassify(item) {
  if (store.mode !== "cloud" || aiOff) return;
  state.pending.add(item.id);
  aiQueue.push(item.id);
  pumpAi();
}
function pumpAi() {
  while (aiRunning < 3 && aiQueue.length) {
    const id = aiQueue.shift();
    const item = state.items.find((i) => i.id === id);
    if (!item) { state.pending.delete(id); continue; }
    aiRunning++;
    store.classify(item)
      .then((room) => {
        if (room) return patchItem(id, { room });
        aiOff = true; // no key or no credit: stop asking until the next visit
        aiQueue.length = 0;
        state.pending.clear();
      })
      .catch((e) => console.warn("classify failed", e))
      .finally(() => {
        aiRunning--;
        state.pending.delete(id);
        render();
        if (viewer.open) drawCaption();
        pumpAi();
      });
  }
}

async function patchItem(id, patch) {
  const before = state.items.find((i) => i.id === id);
  if (!before) return;
  const swap = (v) => (state.items = state.items.map((i) => (i.id === id ? v : i)));
  swap({ ...before, ...patch });
  render();
  try {
    await store.updateItem(id, patch);
  } catch (e) {
    swap(before);
    render();
    toast(`Couldn't save: ${e.message}`);
  }
}

/* ---------------- events ---------------- */

async function onAct(act, el) {
  const sel = state.selected;
  if (act === "add") openAdd();
  if (act === "view") {
    state.view = el.dataset.val;
    ls.set("view", state.view);
    $("#main").scrollTo(0, 0);
    renderNow();
  }
  if (act === "cancel") setSelecting(false);
  if (act === "select-all") {
    const items = sections().find((s) => String(s.id) === el.dataset.id)?.items || [];
    const all = items.every((i) => sel.has(i.id));
    for (const i of items) all ? sel.delete(i.id) : sel.add(i.id);
    state.armed = false;
    renderNow();
  }
  if (act === "delete" && sel?.size) {
    if (!state.armed) {
      state.armed = true;
      renderNav();
      return toast(`Tap again to delete ${photos(sel.size)}`);
    }
    const items = selectedItems();
    if (await deleteItems(items)) { toast(`Deleted ${photos(items.length)}`); haptic("success"); }
    setSelecting(false);
  }
  if (act === "remove-source") {
    const its = state.items.filter((i) => i.source_id === el.dataset.id);
    if (!el.classList.contains("armed")) {
      el.classList.add("armed");
      el.textContent = its.length ? `Remove + ${photos(its.length)}` : "Remove";
      return;
    }
    try {
      if (its.length) await store.deleteItems(its);
      state.items = state.items.filter((i) => i.source_id !== el.dataset.id);
      await removeSource(el.dataset.id);
    } catch (e) { toast(`Couldn't remove: ${e.message}`); }
    render();
  }
}

function bindEvents() {
  installButtonHaptics((e) => suppressClick && e.target.closest("#view .tile"));
  document.addEventListener("click", (e) => {
    const tile = e.target.closest("#view .tile");
    if (suppressClick) { suppressClick = false; if (tile) return; }
    if (tile) return state.selected ? toggleSelected(tile.dataset.id) : openViewer(tile.dataset.id);
    const el = e.target.closest("[data-act]");
    if (el && el.tagName !== "SELECT") onAct(el.dataset.act, el);
  });
  $("#nav").addEventListener("change", async (e) => { // move the selection to a room
    if (e.target.dataset.act !== "room" || !e.target.value) return;
    const room = e.target.value, items = selectedItems();
    setSelecting(false);
    await Promise.all(items.map((i) => patchItem(i.id, { room })));
    toast(`Moved ${photos(items.length)} to ${ROOMS[room]}`);
    haptic("success");
  });
  $("#backdrop").onclick = closeSheet;
  $("#viewer").onclick = onViewerClick;
  $("#viewer").addEventListener("change", async (e) => {
    const item = currentItem();
    if (!item) return;
    await patchItem(item.id, { room: e.target.value });
    drawCaption();
  });
  $("#files").onchange = (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    uploadFiles(files, uploadRoom);
    uploadRoom = null;
  };
  // Desktop: paste a link anywhere to add it
  document.addEventListener("paste", (e) => {
    if (e.target.closest?.("input")) return;
    const url = firstUrl(e.clipboardData?.getData("text"));
    if (url) { e.preventDefault(); closeSheet(); state.view === "art" ? addArt(url) : addLink(url); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, select, textarea")) return;
    if (viewer.open) {
      const strip = $("#viewer .strip");
      if (e.key === "ArrowRight") strip.scrollBy({ left: strip.clientWidth, behavior: "smooth" });
      if (e.key === "ArrowLeft") strip.scrollBy({ left: -strip.clientWidth, behavior: "smooth" });
      if (e.key === "Escape") popLayer();
      if (e.key === "i") { viewer.info = !viewer.info; syncChrome(); }
      return;
    }
    if (e.key === "Escape") state.selected ? setSelecting(false) : closeSheet();
    if (e.key === "+" || e.key === "=") setZoom(state.zoom - 1);
    if (e.key === "-") setZoom(state.zoom + 1);
  });
  // Rotating a phone: re-flow the wall for the new width, and keep the viewer on the same photo (its scroll position
  // was measured in the old width, which left it between two photos). iOS reports the new size a beat after the
  // event, so this runs once on the next frames and once more after the rotation settles.
  let w = innerWidth, settle;
  const relayout = () => {
    if (innerWidth === w) return;
    w = innerWidth;
    renderNow();
    const strip = viewer.open && $("#viewer .strip");
    if (strip) {
      viewer.relayout = true;
      resetZoom();
      strip.scrollLeft = viewer.index * strip.clientWidth;
      requestAnimationFrame(() => { strip.scrollLeft = viewer.index * strip.clientWidth; viewer.relayout = false; });
    }
  };
  const onResize = () => { requestAnimationFrame(() => requestAnimationFrame(relayout)); clearTimeout(settle); settle = setTimeout(relayout, 350); };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  visualViewport?.addEventListener("resize", onResize);
  setupZoom();
  setupLongPress();
}

/* ---------------- boot ---------------- */

// Passcode screen: four boxes like a phone's lock screen. One hidden numeric input takes the typing (and the phone's
// number pad); the boxes show a dot per digit. The fourth digit submits; a wrong code shakes and clears.
function showLogin() {
  const el = $("#login");
  el.hidden = false;
  el.innerHTML = `<form autocomplete="off">
    <h1>Moodboard</h1>
    <p class="hint">Enter passcode</p>
    <label class="pin">
      <input name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" aria-label="Passcode">
      <span></span><span></span><span></span><span></span>
    </label>
    <p class="err"></p>
  </form>`;
  const form = $("form", el), input = form.pin, boxes = [...el.querySelectorAll(".pin span")];
  let busy = false;
  const paint = () => boxes.forEach((b, i) => { b.classList.toggle("on", i < input.value.length); b.classList.toggle("at", i === Math.min(input.value.length, 3) && !busy); });
  input.oninput = async () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 4);
    $(".err", el).textContent = "";
    paint();
    if (input.value.length < 4 || busy) return;
    busy = true; paint();
    try {
      await store.unlock(input.value);
      el.hidden = true;
      start();
    } catch (e) {
      $(".err", el).textContent = e.message;
      form.classList.remove("shake"); void form.offsetWidth; form.classList.add("shake");
      input.value = "";
    }
    busy = false; paint();
  };
  form.onsubmit = (e) => e.preventDefault();
  el.onclick = () => input.focus();
  paint(); input.focus();
}

async function seed() {
  const key = `seeded:${store.user.id}`;
  let done = ls.get(key, []);
  if (done === true) done = SEED[0].photos.map((p) => p.url); // boards seeded before the list could grow
  for (const group of SEED) {
    // also skip any already on the board: "done" lives in this browser only, so a new device or address would re-add them
    const file = (u) => (u || "").split("?")[0].split("/").pop();
    const todo = group.photos.filter((p) => !done.includes(p.url) && !state.items.some((i) => file(i.origin_url) === file(p.url)));
    if (!todo.length) continue;
    ls.set(key, (done = [...done, ...todo.map((p) => p.url)]));
    let sourceId = null;
    if (group.source) {
      const existing = state.sources.find((s) => sameUrl(s.url, group.source.url));
      const source = existing || await store.addSource(group.source);
      if (!existing) state.sources.unshift(source);
      sourceId = source.id;
    }
    await importImages(todo.map((p) => p.url), sourceId, (url) => todo.find((p) => p.url === url).room);
  }
}

async function start() {
  try {
    Object.assign(state, await store.load());
  } catch (e) {
    toast(`Couldn't load your board: ${e.message}`);
  }
  renderNow();
  state.items.filter((i) => !i.room).forEach(queueClassify); // sort anything AI missed last time
  // Installed on Android, the share sheet opens the app with ?url= or ?text=
  const q = new URLSearchParams(location.search);
  const shared = firstUrl(q.get("url")) || firstUrl(q.get("text")) || firstUrl(q.get("title"));
  if (shared) { history.replaceState(null, "", location.pathname); addLink(shared); }
  else seed().catch((e) => console.warn("seed failed", e));
}

async function boot() {
  bindEvents();
  try {
    store = await createStore(config);
  } catch (e) {
    $("#view").innerHTML = `<div class="empty"><b>Couldn't connect</b>${esc(e.message)}</div>`;
    return;
  }
  if (store.mode === "cloud" && !store.user) showLogin(); else start();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
