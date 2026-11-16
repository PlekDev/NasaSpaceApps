// AI-assisted (Claude Code); reviewed by the author.
/** What each target is, in two sentences, for the Explore header. General context written for the interface (the site ids and the
 *  "Artemis candidate" tags come from config/sites.yaml and the manifest). The team should review the wording before presenting.
 *  Pure data: node --test loads it directly. */
export const ABOUT: Record<string, string> = {
  moon_connecting_ridge: 'The ridge that links the rims of Shackleton and de Gerlache craters, right next to the lunar south pole. Its high ground catches sunlight for long stretches while the crater floors beside it stay in permanent shadow.',
  moon_nobile_rim1: 'A stretch of the rim of Nobile crater near the lunar south pole, one of the regions NASA lists as a candidate landing area for Artemis. Rough, sloping rim terrain with long low-Sun shadows.',
  moon_de_gerlache_rim: 'The rim of de Gerlache crater, beside Shackleton at the lunar south pole. Raised rim terrain that stays lit while the crater interior below it stays dark.',
  moon_malapert: 'A large mountain massif near the lunar south pole. Its high slopes see the Sun for long periods and keep a line of sight toward Earth, which makes it a long-standing landing-site candidate.',
  moon_haworth: 'The area around Haworth crater near the lunar south pole, an Artemis candidate region. The crater floor is permanently shadowed; the surrounding terrain mixes sunlit high ground with deep shadow.',
  moon_leibnitz_beta: 'An elevated plateau near the lunar south pole, an Artemis candidate region. Comparatively level high ground surrounded by steeper slopes and low-Sun shadow.',
  mars_arcadia: 'A low, smooth plain in the northern mid-latitudes of Mars, studied as a human landing area because water ice lies close to the surface. Its flatness makes it hard to tell apart from ordinary plains on Earth.',
  mars_jezero: "A crater about 45 km across that once held a lake, with an ancient river delta on its western side. NASA's Perseverance rover has explored it since 2021.",
  mars_deuteronilus: 'A belt of mesas and valleys in the northern mid-latitudes of Mars where glacial ice lies buried under rock and dust, a candidate source of water for crews.',
};
export const TOPO_SOURCE: Record<string, string> = { moon: 'Topography: NASA LRO LOLA, 5 m per pixel', mars: 'Topography: NASA MRO CTX stereo model, 20 m per pixel' };
