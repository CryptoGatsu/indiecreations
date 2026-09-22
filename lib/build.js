// The build currently live in the playtest area, or null when there isn't one.
// To put a build live: drop the Unity WebGL export in /public/game and set e.g.
//   export const ACTIVE_BUILD = { name: 'My Favorite Sheep', version: 'v0.1 playtest' };
// null: holders see "No build live right now", the game files stay closed, and reviews / tickets are refused.
export const ACTIVE_BUILD = null;
