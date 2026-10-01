// Starter photos. Each one is added once per board (also to boards created before it was listed here);
// once added, deleting it keeps it gone.
const L = "https://images.listonce.com.au/custom/1280x/listings/21-heller-street-brunswick-vic-3056/239/01973239_img_";
const local = (file) => new URL(`seed/${file}`, location.href).href;

export const SEED = [
  {
    source: {
      url: "https://www.jelliscraig.com.au/property-details-21-Heller-Street-Brunswick/1973239",
      title: "21 Heller Street, Brunswick",
      kind: "listing",
      summary: "Federation house reimagined: period front rooms, a contemporary open-plan rear, and bifolds onto a deck and garden.",
    },
    photos: [
      { url: `${L}08.jpg`, room: "bedroom" },
      { url: `${L}04.jpg`, room: "living" },
      { url: `${L}03.jpg`, room: "kitchen" },
      { url: `${L}02.jpg`, room: "living" },
    ],
  },
  {
    source: null, // your own photos
    photos: [
      { url: local("trellis-white.webp"), room: "outdoor" },
      { url: local("trellis-black.webp"), room: "outdoor" },
    ],
  },
];
