// Imported automatically the first time the board is empty, so it starts with something on it.
const L = "https://images.listonce.com.au/custom/1280x/listings/21-heller-street-brunswick-vic-3056/239/01973239_img_";

export const SEED = {
  property: {
    url: "https://www.jelliscraig.com.au/property-details-21-Heller-Street-Brunswick/1973239",
    title: "21 Heller Street, Brunswick",
    description: "Federation elegance, reimagined. A remarkable transformation of traditional Federation architecture, this Brunswick residence combines period elegance with contemporary living.",
    cover_url: `${L}01.jpg`,
  },
  photos: [
    { url: `${L}08.jpg`, room: "bedroom" },
    { url: `${L}04.jpg`, room: "living" },
    { url: `${L}03.jpg`, room: "kitchen" },
    { url: `${L}02.jpg`, room: "living" },
  ],
};
