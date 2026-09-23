// The build currently live in the playtest area, or null when there isn't one.
// To put a build live: drop the Unity WebGL export in /public/game and set e.g.
//   export const ACTIVE_BUILD = { name: 'My Favorite Sheep', version: 'v0.1 playtest' };
// null: holders see "No build live right now", the game files stay closed, and reviews / tickets are refused.
export const ACTIVE_BUILD = null;

// A downloadable build, for games that don't run in the browser. The zip sits in the site's private Vercel Blob
// store (upload: `vercel blob put <zip> --pathname <pathname> --access private`), and verified holders get a
// personal link from /api/playtest/download that expires after a few minutes. null: no download on offer.
export const DOWNLOAD_BUILD = {
  name: 'My Favorite Sheep',
  version: 'v0.1 private playtest',
  platform: 'Windows 10 / 11, 64-bit',
  pathname: 'playtest/MyFavoriteSheep-Playtest.zip',
  sizeMb: 116,
};

// What reviews are filed under: the browser build when one is live, otherwise the download.
export const REVIEW_BUILD = ACTIVE_BUILD || DOWNLOAD_BUILD;
