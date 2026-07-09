// server/src/referee-cli.ts
import { createInterface } from "node:readline";

// server/src/referee.ts
import { randomUUID } from "node:crypto";

// src/core/map.ts
var PLACEMENTS = [
  { type: "infantry", owner: "blue", x: 6, y: 1 },
  { type: "infantry", owner: "blue", x: 10, y: 1 },
  { type: "heavyInfantry", owner: "blue", x: 8, y: 2 },
  { type: "recon", owner: "blue", x: 12, y: 2 },
  { type: "smallTank", owner: "blue", x: 6, y: 3 },
  { type: "largeTank", owner: "blue", x: 9, y: 3 },
  { type: "artillery", owner: "blue", x: 5, y: 2 },
  { type: "drone", owner: "blue", x: 13, y: 2 },
  { type: "stealthBomber", owner: "blue", x: 3, y: 2 },
  { type: "seaFort", owner: "blue", x: 1, y: 1 },
  { type: "icbm", owner: "blue", x: 11, y: 0 },
  { type: "infantry", owner: "red", x: 6, y: 10 },
  { type: "infantry", owner: "red", x: 10, y: 10 },
  { type: "heavyInfantry", owner: "red", x: 8, y: 9 },
  { type: "recon", owner: "red", x: 12, y: 9 },
  { type: "smallTank", owner: "red", x: 6, y: 8 },
  { type: "largeTank", owner: "red", x: 9, y: 8 },
  { type: "artillery", owner: "red", x: 4, y: 9 },
  { type: "drone", owner: "red", x: 13, y: 9 },
  { type: "stealthBomber", owner: "red", x: 3, y: 9 },
  { type: "seaFort", owner: "red", x: 1, y: 9 },
  { type: "icbm", owner: "red", x: 10, y: 11 }
];
var BASES = [
  { x: 4, y: 1, owner: "blue" },
  { x: 14, y: 2, owner: "blue" },
  { x: 4, y: 10, owner: "red" },
  { x: 14, y: 9, owner: "red" },
  { x: 6, y: 5, owner: null },
  { x: 11, y: 6, owner: null }
];
var MAPS = [
  {
    name: "Crossfire Basin",
    bases: BASES,
    placements: PLACEMENTS,
    rows: [
      "~~...F...@...F....",
      "~r.....2.........",
      "~~..F.....-...F.o.",
      "~..-...M...-......",
      "~~.-...MM..-..o...",
      "~r.-......-....F..",
      "~~.-..F...-.....F.",
      "~..-.o....-...M...",
      "~~.-......-..MM...",
      "~r...F........F...",
      "~~.....1.....F..o.",
      "~...F...!...F....."
    ]
  },
  {
    // Same homelands, but a central mountain ridge with a single road pass —
    // forces the fight through the middle and rewards indirect fire.
    name: "Highland Pass",
    bases: BASES,
    placements: PLACEMENTS,
    rows: [
      "~~...F...@...F....",
      "~r.....2.........",
      "~~..F.....-...F.o.",
      "~..-...M...-......",
      "~~.MM.....-...MM..",
      "~r.M..F...-..F.M..",
      "~~.M..F...-..F.M..",
      "~..MM.....-...MM..",
      "~~.-......-..MM...",
      "~r...F........F...",
      "~~.....1.....F..o.",
      "~...F...!...F....."
    ]
  },
  {
    // Dense central forest — slow going, high cover, fights in close lanes.
    name: "Forest Maze",
    bases: BASES,
    placements: PLACEMENTS,
    rows: [
      "~~...F...@...F....",
      "~r.....2.........",
      "~~..F.....-...F.o.",
      "~..-...M...-......",
      "~~.FF..F..-..F.FF.",
      "~r.F..FF..-.FF..F.",
      "~~.F..FF..-.FF..F.",
      "~..FF..F..-..F.FF.",
      "~~.-......-..MM...",
      "~r...F........F...",
      "~~.....1.....F..o.",
      "~...F...!...F....."
    ]
  },
  {
    // Wide open plains — fast, aggressive, little cover. Punishes over-extension.
    name: "Open Steppe",
    bases: BASES,
    placements: PLACEMENTS,
    rows: [
      "~~...F...@...F....",
      "~r.....2.........",
      "~~..F.....-...F.o.",
      "~..-...M...-......",
      "~~........-....o..",
      "~r...F....-.......",
      "~~........-..o....",
      "~....F....-...F...",
      "~~.-......-..MM...",
      "~r...F........F...",
      "~~.....1.....F..o.",
      "~...F...!...F....."
    ]
  }
];
var MAP_NAMES = MAPS.map((m) => m.name);
var START_FUNDS = 5e3;
var INCOME_PER_PROPERTY = 1e3;
var STARTER_MAP = { name: MAPS[0].name, width: 18, height: 12 };

// src/core/terrain.ts
var INF = Infinity;
var TERRAIN_DEFS = {
  plain: {
    type: "plain",
    name: "Plains",
    defenseStars: 1,
    cost: { foot: 1, wheel: 2, tread: 1, air: 1, sea: INF, none: INF }
  },
  road: {
    type: "road",
    name: "Road",
    defenseStars: 0,
    cost: { foot: 1, wheel: 1, tread: 1, air: 1, sea: INF, none: INF }
  },
  forest: {
    type: "forest",
    name: "Forest",
    defenseStars: 3,
    cost: { foot: 1, wheel: 3, tread: 2, air: 1, sea: INF, none: INF }
  },
  mountain: {
    type: "mountain",
    name: "Mountain",
    defenseStars: 4,
    cost: { foot: 2, wheel: INF, tread: INF, air: 1, sea: INF, none: INF }
  },
  river: {
    // foot soldiers can wade across (slowly); vehicles need a road bridge.
    // light cover — better than open ground, far worse than high ground.
    type: "river",
    name: "River",
    defenseStars: 1,
    cost: { foot: 2, wheel: INF, tread: INF, air: 1, sea: 1, none: INF }
  },
  bridge: {
    // a crossing over a river: every land unit drives across it. No cover.
    type: "bridge",
    name: "Bridge",
    defenseStars: 0,
    cost: { foot: 1, wheel: 1, tread: 1, air: 1, sea: INF, none: INF }
  },
  sea: {
    type: "sea",
    name: "Sea",
    defenseStars: 0,
    cost: { foot: INF, wheel: INF, tread: INF, air: 1, sea: 1, none: INF }
  },
  reef: {
    type: "reef",
    name: "Reef",
    defenseStars: 2,
    cost: { foot: INF, wheel: INF, tread: INF, air: 1, sea: 1, none: INF }
  },
  port: {
    // coastal dock: land units + ships can use it; infantry capture from shore
    type: "port",
    name: "Sea Port",
    defenseStars: 3,
    cost: { foot: 1, wheel: 1, tread: 1, air: 1, sea: 1, none: INF }
  },
  seafort: {
    // open-sea platform: foot (dropped from a Lander) + ships + air, no vehicles
    type: "seafort",
    name: "Sea Fort",
    defenseStars: 4,
    cost: { foot: 1, wheel: INF, tread: INF, air: 1, sea: 1, none: INF }
  },
  city: {
    type: "city",
    name: "City",
    defenseStars: 3,
    cost: { foot: 1, wheel: 1, tread: 1, air: 1, sea: INF, none: INF }
  },
  base: {
    type: "base",
    name: "Barracks",
    defenseStars: 3,
    cost: { foot: 1, wheel: 1, tread: 1, air: 1, sea: INF, none: INF }
  },
  airport: {
    type: "airport",
    name: "Airport",
    defenseStars: 3,
    cost: { foot: 1, wheel: 1, tread: 1, air: 1, sea: INF, none: INF }
  },
  hq: {
    type: "hq",
    name: "HQ",
    defenseStars: 4,
    cost: { foot: 1, wheel: 1, tread: 1, air: 1, sea: INF, none: INF }
  }
};
function terrainDef(t) {
  return TERRAIN_DEFS[t];
}
function moveCost(terrain, move) {
  return TERRAIN_DEFS[terrain].cost[move];
}
var PROPERTIES = ["city", "hq", "base", "airport", "port", "seafort"];
function isCapturable(t) {
  return PROPERTIES.includes(t);
}
function isIncomeProperty(t) {
  return PROPERTIES.includes(t);
}

// src/core/units.ts
var UNIT_DEFS = {
  infantry: {
    type: "infantry",
    name: "Infantry",
    abbr: "INF",
    armor: "soft",
    move: "foot",
    movePoints: 3,
    vision: 2,
    canCapture: true,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    damage: { soft: 55, light: 12, heavy: 5, structure: 15 },
    value: 10,
    cost: 1e3,
    buildable: true,
    ammoMax: 12
    // foot: never strands; can run out of ammo
  },
  heavyInfantry: {
    type: "heavyInfantry",
    name: "Heavy Infantry",
    abbr: "HVY",
    armor: "soft",
    move: "foot",
    movePoints: 2,
    vision: 2,
    canCapture: false,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    damage: { soft: 65, light: 55, heavy: 55, sea: 22, structure: 25 },
    value: 18,
    cost: 3e3,
    buildable: true,
    ammoMax: 6
  },
  engineer: {
    type: "engineer",
    name: "Engineer",
    abbr: "ENG",
    armor: "soft",
    move: "foot",
    movePoints: 3,
    vision: 2,
    canCapture: false,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    damage: {},
    // unarmed — builds bridges over adjacent rivers
    value: 12,
    cost: 4e3,
    buildable: true
  },
  recon: {
    type: "recon",
    name: "Recon",
    abbr: "RCN",
    armor: "light",
    move: "wheel",
    movePoints: 8,
    vision: 5,
    canCapture: false,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    damage: { soft: 70, light: 45, heavy: 6, air: 32, structure: 10 },
    value: 14,
    cost: 4e3,
    buildable: true,
    fuelMax: 70,
    ammoMax: 12
  },
  apc: {
    type: "apc",
    name: "APC",
    abbr: "APC",
    armor: "light",
    move: "tread",
    movePoints: 7,
    vision: 2,
    canCapture: false,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    damage: {},
    // unarmed transport
    value: 16,
    cost: 5e3,
    buildable: true,
    capacity: 1,
    carries: ["foot"],
    fuelMax: 70
  },
  smallTank: {
    type: "smallTank",
    name: "Small Tank",
    abbr: "TNK",
    armor: "heavy",
    move: "tread",
    movePoints: 6,
    vision: 3,
    canCapture: false,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    damage: { soft: 75, light: 70, heavy: 55, sea: 24, structure: 30 },
    value: 28,
    cost: 7e3,
    buildable: true,
    fuelMax: 70,
    ammoMax: 9
  },
  largeTank: {
    type: "largeTank",
    name: "Large Tank",
    abbr: "LGT",
    armor: "heavy",
    move: "tread",
    movePoints: 5,
    vision: 2,
    canCapture: false,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    damage: { soft: 85, light: 85, heavy: 75, sea: 55, structure: 55 },
    value: 44,
    cost: 16e3,
    buildable: true,
    fuelMax: 70,
    ammoMax: 8
  },
  artillery: {
    type: "artillery",
    name: "Artillery",
    abbr: "ART",
    armor: "light",
    move: "tread",
    movePoints: 5,
    vision: 2,
    canCapture: false,
    minRange: 2,
    maxRange: 3,
    indirect: true,
    damage: { soft: 90, light: 80, heavy: 70, sea: 60, structure: 55 },
    value: 32,
    cost: 6e3,
    buildable: true,
    fuelMax: 60,
    ammoMax: 6
  },
  lander: {
    type: "lander",
    name: "Lander",
    abbr: "LND",
    armor: "sea",
    move: "sea",
    movePoints: 6,
    vision: 2,
    canCapture: false,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    damage: {},
    // unarmed transport
    // built at Ports (not land factories); carries foot units across water
    value: 22,
    cost: 12e3,
    buildable: false,
    capacity: 2,
    carries: ["foot"],
    fuelMax: 99
  },
  helicopter: {
    type: "helicopter",
    name: "Helicopter",
    abbr: "HEL",
    armor: "air",
    move: "air",
    movePoints: 6,
    vision: 4,
    canCapture: false,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    damage: {},
    // unarmed transport — lifts a light vehicle over mountains/sea
    value: 26,
    cost: 11e3,
    buildable: true,
    capacity: 1,
    carries: ["wheel", "tread"],
    fuelMax: 99,
    idleDrain: 2
  },
  drone: {
    type: "drone",
    name: "Drone",
    abbr: "DRN",
    armor: "air",
    move: "air",
    movePoints: 7,
    vision: 6,
    canCapture: false,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    damage: { soft: 75, light: 65, heavy: 35, air: 55, sea: 55, structure: 25 },
    value: 30,
    cost: 9e3,
    buildable: true,
    fuelMax: 80,
    idleDrain: 3,
    ammoMax: 8
  },
  stealthBomber: {
    type: "stealthBomber",
    name: "Stealth Bomber",
    abbr: "STB",
    armor: "air",
    move: "air",
    movePoints: 8,
    vision: 4,
    canCapture: false,
    minRange: 1,
    maxRange: 1,
    indirect: false,
    // Devastating vs ground/sea; cannot engage air. ("Stealth" evasion is
    // deferred until fog/AA exist — see notes; for now it's a glass cannon.)
    damage: { soft: 110, light: 105, heavy: 95, sea: 95, structure: 75 },
    value: 55,
    cost: 22e3,
    buildable: true,
    fuelMax: 80,
    idleDrain: 4,
    ammoMax: 6
  },
  seaFort: {
    type: "seaFort",
    name: "Naval Gun",
    abbr: "GUN",
    armor: "sea",
    move: "none",
    movePoints: 0,
    vision: 4,
    canCapture: false,
    minRange: 2,
    maxRange: 4,
    indirect: true,
    damage: { soft: 80, light: 75, heavy: 70, sea: 80, air: 40, structure: 60 },
    value: 50,
    cost: 8e3,
    ammoMax: 8
    // buildable at a Sea Port for coastal defence
  },
  icbm: {
    type: "icbm",
    name: "ICBM Silo",
    abbr: "BMB",
    armor: "structure",
    move: "none",
    movePoints: 0,
    vision: 1,
    canCapture: false,
    minRange: 0,
    maxRange: 999,
    indirect: true,
    // Launch does splash damage in a radius (see combat.ts), capped to leave
    // survivors at 1 HP — softens a cluster, never instantly wipes it.
    damage: {},
    value: 40,
    special: "icbm",
    cooldownMax: 3
  }
};
function unitDef(type) {
  return UNIT_DEFS[type];
}
function usesFuel(def) {
  return def.move !== "foot" && def.move !== "none";
}
function curFuel(u) {
  return u.fuel ?? UNIT_DEFS[u.type].fuelMax ?? Infinity;
}
function curAmmo(u) {
  return u.ammo ?? UNIT_DEFS[u.type].ammoMax ?? Infinity;
}
function canFight(u) {
  const d = UNIT_DEFS[u.type];
  if (curAmmo(u) <= 0) return false;
  if (usesFuel(d) && curFuel(u) <= 0) return false;
  return true;
}
function hpStars(hp) {
  return Math.max(0, Math.min(10, Math.ceil(hp / 10)));
}
function isAir(type) {
  return UNIT_DEFS[type].move === "air";
}
function transportCapacity(type) {
  return UNIT_DEFS[type].capacity ?? 0;
}
function canCarry(transport, cargo) {
  const t = UNIT_DEFS[transport];
  if (!t.capacity) return false;
  const c = UNIT_DEFS[cargo];
  if (c.capacity || c.special || c.move === "none") return false;
  if (!(t.carries ?? ["foot"]).includes(c.move)) return false;
  if (transport === "helicopter" && cargo === "largeTank") return false;
  return true;
}
var byCost = (a, b) => (a.cost ?? 0) - (b.cost ?? 0);
var defs = Object.values(UNIT_DEFS);
var BUILDABLE_TYPES = defs.filter((d) => d.buildable && (d.move === "foot" || d.move === "wheel" || d.move === "tread")).sort(byCost).map((d) => d.type);
var AIR_BUILD_TYPES = defs.filter((d) => d.buildable && d.move === "air").sort(byCost).map((d) => d.type);
var NAVAL_BUILD_TYPES = ["lander", "seaFort"];
function buildListFor(terrain) {
  if (terrain === "base") return BUILDABLE_TYPES;
  if (terrain === "airport") return AIR_BUILD_TYPES;
  if (terrain === "port") return NAVAL_BUILD_TYPES;
  return [];
}

// src/core/rng.ts
function nextRng(state) {
  let t = state + 1831565813 | 0;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  const value = ((t ^ t >>> 14) >>> 0) / 4294967296;
  return { value, state: t >>> 0 };
}
var Rng = class {
  constructor(state) {
    this.state = state;
  }
  next() {
    const r = nextRng(this.state);
    this.state = r.state;
    return r.value;
  }
  int(maxExclusive) {
    return Math.floor(this.next() * maxExclusive);
  }
  pick(arr) {
    return arr[this.int(arr.length)];
  }
};

// src/core/mapgen.ts
var THEMES = [
  { id: "land", name: "Continental", biome: "temperate", forest: 4, mountain: 2, water: 0.4, special: "none" },
  { id: "mountainous", name: "Mountains", biome: "temperate", forest: 2, mountain: 7, water: 0.4, special: "none" },
  { id: "tropical", name: "Tropical", biome: "tropical", forest: 6, mountain: 1, water: 2.5, special: "none", dryHome: true },
  { id: "desert", name: "Desert", biome: "desert", forest: 1, mountain: 3, water: 0.25, special: "none" },
  { id: "snow", name: "Snowfield", biome: "snow", forest: 3, mountain: 3, water: 0.8, special: "none" },
  { id: "urban", name: "Urban", biome: "urban", forest: 1, mountain: 1, water: 0.5, special: "none", cityBoost: 3 },
  { id: "rivers", name: "River Delta", biome: "temperate", forest: 3, mountain: 1, water: 1, special: "rivers" },
  { id: "straits", name: "Straits", biome: "temperate", forest: 2.5, mountain: 1.5, water: 1, special: "channel", dryHome: true, waterHeavy: true },
  { id: "beach", name: "Beachhead", biome: "temperate", forest: 1.5, mountain: 1, water: 1, special: "beach", dryHome: true, waterHeavy: true },
  { id: "island", name: "Islands", biome: "tropical", forest: 2, mountain: 1, water: 6, special: "none", dryHome: true, waterHeavy: true, seaFill: "islands" },
  { id: "fullsea", name: "Open Sea", biome: "temperate", forest: 0.5, mountain: 0.5, water: 9, special: "none", dryHome: true, waterHeavy: true, seaFill: "ocean" },
  { id: "mtnsnow", name: "Snow Peaks", biome: "snow", forest: 2, mountain: 7, water: 0.5, special: "none" },
  { id: "mtndesert", name: "Badlands", biome: "desert", forest: 0.8, mountain: 7, water: 0.25, special: "none" }
];
function themeDef(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
var MAP_W = 24;
var MAP_H = 12;
var W = MAP_W;
var H = MAP_H;
var HALF = H / 2;
var CC = Math.floor(W / 2);
var CORRIDOR = /* @__PURE__ */ new Set([CC - 1, CC]);
var DENSITY = W / 18;
function mirror(x, y) {
  return [W - 1 - x, H - 1 - y];
}
function blankTile() {
  return { terrain: "plain", owner: null, isHQ: false, captureLeft: 20, capturingId: null };
}
function passable(t, move) {
  return isFinite(moveCost(t.terrain, move));
}
function isWater(t) {
  return t === "sea" || t === "reef";
}
function pickFeature(rng, th) {
  const total = th.forest + th.mountain + th.water;
  let r = rng.next() * total;
  if ((r -= th.forest) < 0) return "forest";
  if ((r -= th.mountain) < 0) return "mountain";
  return rng.next() < 0.35 ? "reef" : "sea";
}
function rosterPool(complexity, waterNearHome) {
  const pool = ["infantry", "infantry", "recon", "smallTank"];
  if (complexity >= 3) pool.push("heavyInfantry", "artillery");
  if (complexity >= 5) pool.push("apc");
  if (complexity >= 6) pool.push("smallTank", "recon");
  if (complexity >= 8) pool.push("largeTank");
  if (complexity >= 11) pool.push("drone");
  if (complexity >= 15) pool.push("stealthBomber");
  if (complexity >= 19) pool.push("icbm");
  if (waterNearHome && complexity >= 5) pool.push("seaFort");
  if (waterNearHome && complexity >= 7) pool.push("lander");
  return pool;
}
function generateState(opts) {
  const th = themeDef(opts.theme);
  const c = Math.max(1, Math.min(25, Math.round(opts.complexity)));
  const rng = new Rng(opts.seed >>> 0 || 1);
  const tiles = [];
  for (let i = 0; i < W * H; i++) tiles.push(blankTile());
  const at = (x, y) => tiles[y * W + x];
  const setTile = (x, y, terrain, owner, hq) => {
    const a = at(x, y);
    a.terrain = terrain;
    a.owner = owner;
    a.isHQ = hq;
    const [mx, my] = mirror(x, y);
    const b = at(mx, my);
    b.terrain = terrain;
    b.owner = owner === null ? null : owner === "blue" ? "red" : "blue";
    b.isHQ = hq;
  };
  const beachBack = th.special === "beach" ? 2 : 0;
  const hqx = Math.max(2, Math.min(W - 3, Math.floor(W / 2) + (rng.int(3) - 1)));
  const hqy = beachBack > 0 ? beachBack : rng.int(2);
  setTile(hqx, hqy, "hq", "blue", true);
  const homeBand = th.seaFill ? 2 : 3;
  const baseCount = Math.max(1, Math.min(3, 1 + Math.floor(c / 8)));
  const homeSpots = [];
  for (let y = beachBack; y < beachBack + homeBand; y++) for (let x = 0; x < W; x++) homeSpots.push([x, y]);
  shuffle(homeSpots, rng);
  let basesPlaced = 0;
  for (const [x, y] of homeSpots) {
    if (basesPlaced >= baseCount) break;
    if (at(x, y).isHQ || at(x, y).terrain === "base") continue;
    if (Math.abs(x - hqx) + Math.abs(y - hqy) < 1) continue;
    setTile(x, y, "base", "blue", false);
    basesPlaced++;
  }
  if (th.seaFill) {
    const fieldTop = beachBack + homeBand;
    for (let y = fieldTop; y < HALF; y++) for (let x = 0; x < W; x++) {
      const t = at(x, y);
      if (t.isHQ || t.owner) continue;
      setTile(x, y, rng.next() < 0.22 ? "reef" : "sea", null, false);
    }
    const fieldH = Math.max(1, HALF - fieldTop);
    if (th.seaFill === "islands") {
      const seeds = 4 + rng.int(3);
      for (let i = 0; i < seeds; i++) {
        let x = rng.int(W), y = fieldTop + rng.int(fieldH);
        const size = 2 + rng.int(4);
        for (let s = 0; s < size; s++) {
          const t = at(x, y);
          if (y >= fieldTop && y < HALF && !t.isHQ && !t.owner) setTile(x, y, "plain", null, false);
          x = Math.max(0, Math.min(W - 1, x + rng.int(3) - 1));
          y = Math.max(fieldTop, Math.min(HALF - 1, y + rng.int(3) - 1));
        }
      }
    } else {
      const rocks = 2 + rng.int(2);
      for (let i = 0; i < rocks; i++) {
        const x = rng.int(W), y = fieldTop + rng.int(fieldH);
        const t = at(x, y);
        if (!t.isHQ && !t.owner) setTile(x, y, rng.next() < 0.5 ? "mountain" : "plain", null, false);
      }
    }
    const crossCols = [Math.round(W * 0.25), Math.floor(W / 2), Math.round(W * 0.75)];
    for (const bx of crossCols) {
      for (let y = fieldTop; y <= H - 1 - fieldTop; y++) {
        for (const [cx, cy] of [[bx, y], mirror(bx, y)]) {
          const t = at(cx, cy);
          if (t.isHQ || t.owner || isCapturable(t.terrain)) continue;
          t.terrain = "bridge";
          t.owner = null;
        }
      }
    }
  }
  const cityPairs = Math.max(1, Math.min(8, Math.round((Math.floor(c / 4) + (th.cityBoost ?? 0)) * DENSITY)));
  let cities = 0;
  for (let tries = 0; tries < 300 && cities < cityPairs; tries++) {
    const x = rng.int(W);
    const y = 1 + rng.int(HALF - 1);
    const [mx, my] = mirror(x, y);
    if (at(x, y).isHQ || at(x, y).terrain !== "plain" || at(mx, my).terrain !== "plain") continue;
    if (x === mx && y === my) continue;
    setTile(x, y, "city", null, false);
    cities++;
  }
  const airportPairs = Math.max(1, Math.round(DENSITY));
  let airports = 0;
  for (let tries = 0; tries < 200 && airports < airportPairs; tries++) {
    const x = rng.int(W);
    const y = 2 + rng.int(HALF - 2);
    const [mx, my] = mirror(x, y);
    if (at(x, y).isHQ || at(x, y).terrain !== "plain" || at(mx, my).terrain !== "plain") continue;
    if (x === mx && y === my) continue;
    setTile(x, y, "airport", null, false);
    airports++;
  }
  const clusters = Math.round((4 + c * 0.7) * (0.7 + rng.next() * 0.6) * DENSITY);
  for (let i = 0; i < clusters; i++) {
    const feat = pickFeature(rng, th);
    if (th.seaFill && isWater(feat)) continue;
    let x = rng.int(W);
    let y = rng.int(HALF);
    const size = 1 + rng.int(4);
    for (let s = 0; s < size; s++) {
      if (y >= 0 && y < HALF && !CORRIDOR.has(x)) {
        const t = at(x, y);
        const dryBlock = isWater(feat) && th.dryHome && y < 3;
        if (t.terrain === "plain" && !t.isHQ && !dryBlock) setTile(x, y, feat, null, false);
      }
      x = Math.max(0, Math.min(W - 1, x + rng.int(3) - 1));
      y = Math.max(0, Math.min(HALF - 1, y + rng.int(3) - 1));
    }
  }
  if (th.special === "beach") {
    for (let y = 0; y < beachBack; y++) for (let x = 0; x < W; x++) {
      if (at(x, y).isHQ || at(x, y).owner) continue;
      setTile(x, y, x % 6 === 0 ? "reef" : "sea", null, false);
    }
  } else if (th.special === "rivers") {
    const count = 2 + (c >= 12 ? 1 : 0);
    for (let r = 0; r < count; r++) {
      const ry = 3 + rng.int(HALF - 3);
      const bridge = 3 + rng.int(W - 6);
      for (let x = 0; x < W; x++) {
        if (at(x, ry).terrain !== "plain") continue;
        setTile(x, ry, CORRIDOR.has(x) || x === bridge ? "bridge" : "river", null, false);
      }
    }
  } else if (th.special === "channel") {
    const yc = HALF - 1;
    const side = 3 + rng.int(Math.max(1, CC - 4));
    const bridgeCols = /* @__PURE__ */ new Set([CC - 1, CC, side, W - 1 - side]);
    for (let x = 0; x < W; x++) {
      const t = at(x, yc);
      if (t.isHQ || t.owner) continue;
      setTile(x, yc, bridgeCols.has(x) ? "bridge" : "sea", null, false);
    }
  }
  if (th.waterHeavy || th.water >= 2) {
    const isWaterAt = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      const t = at(tx, ty).terrain;
      return t === "sea" || t === "reef";
    };
    const cand = [];
    for (let y = 1; y < HALF; y++) for (let x = 0; x < W; x++) {
      const t = at(x, y);
      if (t.terrain !== "sea" && t.terrain !== "reef" || t.isHQ || t.owner || CORRIDOR.has(x)) continue;
      const [mx, my] = mirror(x, y);
      if (mx === x && my === y) continue;
      const wn = (isWaterAt(x - 1, y) ? 1 : 0) + (isWaterAt(x + 1, y) ? 1 : 0) + (isWaterAt(x, y - 1) ? 1 : 0) + (isWaterAt(x, y + 1) ? 1 : 0);
      cand.push({ x, y, wn, key: y * W + x });
    }
    shuffle(cand, rng);
    const used = /* @__PURE__ */ new Set();
    let forts = 0;
    const maxForts = th.waterHeavy ? 2 : 1, maxPorts = 2;
    for (const s of [...cand].sort((a, b) => b.wn - a.wn)) {
      if (forts >= maxForts || s.wn < 3) break;
      setTile(s.x, s.y, "seafort", null, false);
      used.add(s.key);
      forts++;
    }
    let ports = 0;
    for (const s of [...cand].sort((a, b) => a.wn - b.wn)) {
      if (ports >= maxPorts) break;
      if (used.has(s.key) || s.wn > 3) continue;
      setTile(s.x, s.y, "port", null, false);
      used.add(s.key);
      ports++;
    }
  }
  {
    const isWaterTile = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      const t = at(tx, ty).terrain;
      return t === "sea" || t === "reef" || t === "port" || t === "seafort";
    };
    for (let pass = 0; pass < 4; pass++) {
      const lonely = [];
      for (let y = 0; y < HALF; y++) for (let x = 0; x < W; x++) {
        const t = at(x, y).terrain;
        if (t !== "sea" && t !== "reef") continue;
        if (!isWaterTile(x - 1, y) && !isWaterTile(x + 1, y) && !isWaterTile(x, y - 1) && !isWaterTile(x, y + 1)) lonely.push([x, y]);
      }
      if (!lonely.length) break;
      for (const [x, y] of lonely) setTile(x, y, "plain", null, false);
    }
  }
  const armySize = Math.max(3, Math.min(11, 3 + Math.floor(c * 0.45)));
  const waterNearHome = anyWaterIn(tiles, 0, 4);
  const pool = rosterPool(c, waterNearHome);
  const chosen = ["infantry", "infantry"];
  while (chosen.length < armySize) chosen.push(rng.pick(pool));
  if (th.waterHeavy && !chosen.includes("drone") && !chosen.includes("stealthBomber")) {
    chosen[chosen.length - 1] = "drone";
  }
  if (th.seaFill && !chosen.includes("lander")) {
    for (let i = chosen.length - 1; i >= 2; i--) {
      if (chosen[i] !== "drone" && chosen[i] !== "stealthBomber") {
        chosen[i] = "lander";
        break;
      }
    }
  }
  const units = [];
  let nextId = 1;
  const occupied = /* @__PURE__ */ new Set();
  const homeCandidates = [];
  const candRows = th.special === "beach" ? 5 : 4;
  for (let y = 0; y < candRows; y++) for (let x = 0; x < W; x++) homeCandidates.push([x, y]);
  shuffle(homeCandidates, rng);
  const addUnit = (type, x, y, owner) => {
    const d = unitDef(type);
    units.push({
      id: nextId++,
      type,
      owner,
      x,
      y,
      hp: 100,
      acted: false,
      cooldown: type === "icbm" ? 2 : 0,
      fuel: d.fuelMax,
      ammo: d.ammoMax
    });
    occupied.add(y * W + x);
  };
  for (const type of chosen) {
    const move = unitDef(type).move;
    for (const [x, y] of homeCandidates) {
      const k = y * W + x;
      if (occupied.has(k)) continue;
      const [mx, my] = mirror(x, y);
      if (occupied.has(my * W + mx)) continue;
      const t = at(x, y);
      if (t.isHQ) continue;
      if (type === "seaFort") {
        if (!isWater(t.terrain)) continue;
      } else if (!passable(t, move)) continue;
      addUnit(type, x, y, "blue");
      addUnit(type, mx, my, "red");
      break;
    }
  }
  ensureConnected(tiles, hqx, hqy);
  return {
    width: W,
    height: H,
    biome: th.biome,
    tiles,
    units,
    turnOwner: "red",
    turnCount: 1,
    nextId,
    winner: null,
    rngState: opts.seed >>> 0 || 1,
    funds: { red: START_FUNDS, blue: START_FUNDS },
    lastCombat: [],
    lastBuilt: null,
    log: [`A ${th.name} battlefield. Red moves first.`]
  };
}
function anyWaterIn(tiles, y0, y1) {
  for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (isWater(tiles[y * W + x].terrain)) return true;
  return false;
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function ensureConnected(tiles, hqx, hqy) {
  if (footConnected(tiles, hqx, hqy)) return;
  const lay = (t) => {
    if (isCapturable(t.terrain)) return;
    t.terrain = isWater(t.terrain) ? "bridge" : "plain";
    t.owner = null;
  };
  const col = 8;
  for (let y = 0; y < H; y++) {
    lay(tiles[y * W + col]);
    const [mx, my] = mirror(col, y);
    lay(tiles[my * W + mx]);
  }
  const lo = Math.min(hqx, col), hi = Math.max(hqx, col);
  for (let x = lo; x <= hi; x++) {
    lay(tiles[hqy * W + x]);
    const [mx, my] = mirror(x, hqy);
    lay(tiles[my * W + mx]);
  }
}
function footConnected(tiles, hqx, hqy) {
  const [tx, ty] = mirror(hqx, hqy);
  const start = hqy * W + hqx;
  const target = ty * W + tx;
  const seen = new Uint8Array(W * H);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const k = stack.pop();
    if (k === target) return true;
    const x = k % W, y = (k - k % W) / W;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = ny * W + nx;
      if (seen[nk] || !isFinite(moveCost(tiles[nk].terrain, "foot"))) continue;
      seen[nk] = 1;
      stack.push(nk);
    }
  }
  return false;
}

// src/core/types.ts
var OTHER = { red: "blue", blue: "red" };

// src/core/pathfind.ts
var DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];
function computeReach(state, unit) {
  const { width, height } = state;
  const def = unitDef(unit.type);
  const start = unit.y * width + unit.x;
  const cost = /* @__PURE__ */ new Map([[start, 0]]);
  const prev = /* @__PURE__ */ new Map();
  if (def.movePoints <= 0 || def.move === "none") {
    return { cost, prev, start };
  }
  const budget = usesFuel(def) ? Math.min(def.movePoints, curFuel(unit)) : def.movePoints;
  const occ = new Array(width * height);
  for (const u of state.units) occ[u.y * width + u.x] = u;
  const best = /* @__PURE__ */ new Map([[start, 0]]);
  const frontier = [start];
  while (frontier.length) {
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) {
      if ((best.get(frontier[i]) ?? Infinity) < (best.get(frontier[bi]) ?? Infinity)) bi = i;
    }
    const cur = frontier.splice(bi, 1)[0];
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const curCost = best.get(cur);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nk = ny * width + nx;
      const tile = state.tiles[nk];
      const stepCost = moveCost(tile.terrain, def.move);
      if (!isFinite(stepCost)) continue;
      const occupant = occ[nk];
      if (occupant && occupant.owner !== unit.owner) continue;
      const nc = curCost + stepCost;
      if (nc > budget) continue;
      if (nc < (best.get(nk) ?? Infinity)) {
        best.set(nk, nc);
        prev.set(nk, cur);
        frontier.push(nk);
        if (!occupant) cost.set(nk, nc);
      }
    }
  }
  return { cost, prev, start };
}

// src/core/combat.ts
function spendAmmo(u) {
  const max = unitDef(u.type).ammoMax;
  if (max != null) u.ammo = Math.max(0, (u.ammo ?? max) - 1);
}
function chebyshev(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}
function defStarsFor(state, unit) {
  if (isAir(unit.type)) return 0;
  const tile = state.tiles[unit.y * state.width + unit.x];
  return terrainDef(tile.terrain).defenseStars;
}
function predictDamage(state, attacker, defender) {
  const aDef = unitDef(attacker.type);
  const base = aDef.damage[unitDef(defender.type).armor];
  if (base === void 0) return 0;
  const raw = base * (attacker.hp / 100);
  const mitig = defStarsFor(state, defender) * (defender.hp / 100) * 0.1;
  return Math.max(0, Math.round(raw * (1 - mitig)));
}
function canTarget(attacker, defender) {
  return unitDef(attacker.type).damage[unitDef(defender.type).armor] !== void 0;
}
function inRange(attacker, ax, ay, defender) {
  const def = unitDef(attacker.type);
  const d = manhattan(ax, ay, defender.x, defender.y);
  return d >= def.minRange && d <= def.maxRange;
}
function resolveAttack(state, attacker, defender) {
  const aDef = unitDef(attacker.type);
  const dDef = unitDef(defender.type);
  const dmgToDefender = predictDamage(state, attacker, defender);
  defender.hp = Math.max(0, defender.hp - dmgToDefender);
  const defenderDied = defender.hp <= 0;
  spendAmmo(attacker);
  let dmgToAttacker = 0;
  const adjacent = manhattan(attacker.x, attacker.y, defender.x, defender.y) === 1;
  if (!defenderDied && !aDef.indirect && !dDef.indirect && adjacent && dDef.damage[aDef.armor] !== void 0 && canFight(defender)) {
    dmgToAttacker = predictDamage(state, defender, attacker);
    attacker.hp = Math.max(0, attacker.hp - dmgToAttacker);
    spendAmmo(defender);
  }
  const attackerDied = attacker.hp <= 0;
  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    ax: attacker.x,
    ay: attacker.y,
    dx: defender.x,
    dy: defender.y,
    dmgToDefender,
    dmgToAttacker,
    defenderDied,
    attackerDied,
    kind: aDef.indirect ? "indirect" : "direct"
  };
}
var ICBM_SPLASH_RADIUS = 1;
var ICBM_DAMAGE = 50;
function resolveIcbm(state, icbm, tx, ty) {
  const events = [];
  for (const u of state.units) {
    if (chebyshev(tx, ty, u.x, u.y) > ICBM_SPLASH_RADIUS) continue;
    const before = u.hp;
    u.hp = Math.max(1, u.hp - ICBM_DAMAGE);
    const loss = before - u.hp;
    if (loss <= 0) continue;
    events.push({
      attackerId: icbm.id,
      defenderId: u.id,
      ax: tx,
      ay: ty,
      dx: u.x,
      dy: u.y,
      dmgToDefender: loss,
      dmgToAttacker: 0,
      defenderDied: false,
      attackerDied: false,
      kind: "icbm"
    });
  }
  return events;
}

// src/core/victory.ts
function computeWinner(state) {
  if (state.winner) return state.winner;
  const counts = { red: 0, blue: 0 };
  for (const u of state.units) counts[u.owner]++;
  if (counts.red === 0 && counts.blue === 0) return null;
  if (counts.red === 0) return "blue";
  if (counts.blue === 0) return "red";
  return null;
}

// src/core/rules.ts
function idx(state, x, y) {
  return y * state.width + x;
}
function inBounds(state, x, y) {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}
function unitAt(state, x, y) {
  return state.units.find((u) => u.x === x && u.y === y);
}
function unitById(state, id) {
  return state.units.find((u) => u.id === id);
}
function tileAt(state, x, y) {
  return state.tiles[idx(state, x, y)];
}
function activeUnits(state, owner) {
  return state.units.filter((u) => u.owner === owner && !u.acted);
}
function cloneState(state) {
  return structuredClone(state);
}
function unitActions(state, unitId) {
  const unit = unitById(state, unitId);
  if (!unit || unit.owner !== state.turnOwner || unit.acted) return [];
  const def = unitDef(unit.type);
  const out = [];
  if (def.special === "icbm") {
    if (unit.cooldown <= 0) {
      const seen = /* @__PURE__ */ new Set();
      for (const u of state.units) {
        const k = idx(state, u.x, u.y);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ kind: "unit", unitId, dest: [unit.x, unit.y], act: { t: "launch", tx: u.x, ty: u.y } });
      }
    }
    out.push({ kind: "unit", unitId, dest: [unit.x, unit.y], act: { t: "wait" } });
    return out;
  }
  const reach = computeReach(state, unit);
  const armed = canFight(unit);
  for (const key of reach.cost.keys()) {
    const dx = key % state.width;
    const dy = (key - dx) / state.width;
    const moved = dx !== unit.x || dy !== unit.y;
    out.push({ kind: "unit", unitId, dest: [dx, dy], act: { t: "wait" } });
    const tile = tileAt(state, dx, dy);
    if (def.canCapture && isCapturable(tile.terrain) && tile.owner !== unit.owner) {
      out.push({ kind: "unit", unitId, dest: [dx, dy], act: { t: "capture" } });
    }
    if (armed && def.indirect) {
      if (!moved) {
        for (const target of state.units) {
          if (target.owner === unit.owner) continue;
          if (!canTarget(unit, target)) continue;
          if (inRange(unit, dx, dy, target)) {
            out.push({ kind: "unit", unitId, dest: [dx, dy], act: { t: "attack", targetId: target.id } });
          }
        }
      }
    } else if (armed) {
      for (const target of state.units) {
        if (target.owner === unit.owner) continue;
        if (!canTarget(unit, target)) continue;
        if (manhattan(dx, dy, target.x, target.y) === 1) {
          out.push({ kind: "unit", unitId, dest: [dx, dy], act: { t: "attack", targetId: target.id } });
        }
      }
    }
  }
  for (const tr of state.units) {
    if (tr.owner !== unit.owner || !canCarry(tr.type, unit.type)) continue;
    if ((tr.cargo?.length ?? 0) >= transportCapacity(tr.type)) continue;
    const tk = idx(state, tr.x, tr.y);
    if (reach.cost.has(tk) || reach.prev.has(tk)) {
      out.push({ kind: "unit", unitId, dest: [tr.x, tr.y], act: { t: "load", transportId: tr.id } });
    }
  }
  if (transportCapacity(unit.type) > 0 && (unit.cargo?.length ?? 0) > 0) {
    const DIRS2 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const key of reach.cost.keys()) {
      const ddx = key % state.width, ddy = (key - key % state.width) / state.width;
      for (let ci = 0; ci < unit.cargo.length; ci++) {
        const cdef = unitDef(unit.cargo[ci].type);
        for (const [ox, oy] of DIRS2) {
          const nx = ddx + ox, ny = ddy + oy;
          if (!inBounds(state, nx, ny)) continue;
          const occ = unitAt(state, nx, ny);
          if (occ && !(nx === unit.x && ny === unit.y)) continue;
          if (!isFinite(moveCost(tileAt(state, nx, ny).terrain, cdef.move))) continue;
          out.push({ kind: "unit", unitId, dest: [ddx, ddy], act: { t: "unload", cargoIdx: ci, tx: nx, ty: ny } });
        }
      }
    }
  }
  if (unit.type === "engineer") {
    const DIRS2 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const key of reach.cost.keys()) {
      const dx = key % state.width, dy = (key - key % state.width) / state.width;
      for (const [ox, oy] of DIRS2) {
        const nx = dx + ox, ny = dy + oy;
        if (inBounds(state, nx, ny) && tileAt(state, nx, ny).terrain === "river") {
          out.push({ kind: "unit", unitId, dest: [dx, dy], act: { t: "buildBridge", tx: nx, ty: ny } });
        }
      }
    }
  }
  return out;
}
function legalMoves(state) {
  if (state.winner) return [];
  const out = [];
  for (const u of activeUnits(state, state.turnOwner)) {
    out.push(...unitActions(state, u.id));
  }
  out.push(...buildActions(state));
  out.push({ kind: "end" });
  return out;
}
function removeDead(state) {
  const dead = state.units.filter((u) => u.hp <= 0);
  if (!dead.length) return;
  for (const d of dead) {
    for (const t of state.tiles) {
      if (t.capturingId === d.id) {
        t.captureLeft = 20;
        t.capturingId = null;
      }
    }
  }
  state.units = state.units.filter((u) => u.hp > 0);
}
function resetCaptureByUnit(state, unitId) {
  for (const t of state.tiles) {
    if (t.capturingId === unitId) {
      t.captureLeft = 20;
      t.capturingId = null;
    }
  }
}
function endTurn(state) {
  const next = OTHER[state.turnOwner];
  state.turnOwner = next;
  if (next === "red") state.turnCount++;
  let income = 0;
  for (const t of state.tiles) {
    if (t.owner === next && isIncomeProperty(t.terrain)) income += INCOME_PER_PROPERTY;
  }
  state.funds[next] += income;
  const supplyAdj = /* @__PURE__ */ new Set();
  for (const u of state.units) {
    if (u.owner !== next || !unitDef(u.type).capacity) continue;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = u.x + dx, ny = u.y + dy;
      if (nx >= 0 && ny >= 0 && nx < state.width && ny < state.height) supplyAdj.add(ny * state.width + nx);
    }
  }
  let crashed = false;
  for (const u of state.units) {
    if (u.owner !== next) continue;
    u.acted = false;
    if (u.cooldown > 0) u.cooldown--;
    const def = unitDef(u.type);
    const t = state.tiles[u.y * state.width + u.x];
    const resupply = t.owner === next && isIncomeProperty(t.terrain) || supplyAdj.has(u.y * state.width + u.x);
    if (def.idleDrain && usesFuel(def)) u.fuel = Math.max(0, curFuel(u) - def.idleDrain);
    if (resupply) {
      if (u.hp < 100) u.hp = Math.min(100, u.hp + HEAL_PER_TURN);
      if (def.fuelMax != null) u.fuel = def.fuelMax;
      if (def.ammoMax != null) u.ammo = def.ammoMax;
    } else if (def.move === "air" && curFuel(u) <= 0) {
      u.hp = 0;
      crashed = true;
      state.log.push(`${next.toUpperCase()} aircraft ran out of fuel and crashed.`);
    }
  }
  if (crashed) state.units = state.units.filter((u) => u.hp > 0);
  if (!state.winner) state.winner = computeWinner(state);
}
var HEAL_PER_TURN = 20;
function buildActions(state) {
  if (state.winner) return [];
  const out = [];
  const funds = state.funds[state.turnOwner];
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t.owner !== state.turnOwner) continue;
    const list = buildListFor(t.terrain);
    if (!list.length) continue;
    const x = i % state.width;
    const y = (i - x) / state.width;
    if (unitAt(state, x, y)) continue;
    for (const type of list) {
      const cost = unitDef(type).cost ?? Infinity;
      if (cost <= funds) out.push({ kind: "build", x, y, unitType: type });
    }
  }
  return out;
}
function applyAction(state, action) {
  const next = cloneState(state);
  next.lastCombat = [];
  next.lastBuilt = null;
  if (next.winner) return next;
  if (action.kind === "end") {
    endTurn(next);
    return next;
  }
  if (action.kind === "build") {
    const tile = tileAt(next, action.x, action.y);
    const def2 = unitDef(action.unitType);
    const cost = def2.cost ?? Infinity;
    const occupied = unitAt(next, action.x, action.y);
    if (tile.owner === next.turnOwner && !occupied && buildListFor(tile.terrain).includes(action.unitType) && next.funds[next.turnOwner] >= cost) {
      next.funds[next.turnOwner] -= cost;
      const u = {
        id: next.nextId++,
        type: action.unitType,
        owner: next.turnOwner,
        x: action.x,
        y: action.y,
        hp: 100,
        acted: true,
        cooldown: 0,
        fuel: def2.fuelMax,
        ammo: def2.ammoMax
      };
      next.units.push(u);
      next.lastBuilt = u.id;
      next.log.push(`${next.turnOwner.toUpperCase()} built ${def2.name}.`);
    }
    return next;
  }
  const unit = unitById(next, action.unitId);
  if (!unit || unit.owner !== next.turnOwner || unit.acted) return next;
  const def = unitDef(unit.type);
  if (action.act.t === "load") {
    const tr = unitById(next, action.act.transportId);
    const cap = tr ? transportCapacity(tr.type) : 0;
    if (tr && tr.owner === unit.owner && canCarry(tr.type, unit.type) && (tr.cargo?.length ?? 0) < cap) {
      if (!tr.cargo) tr.cargo = [];
      tr.cargo.push({ ...unit, x: tr.x, y: tr.y, acted: false, cargo: void 0 });
      next.units = next.units.filter((u) => u.id !== unit.id);
    }
    return next;
  }
  const [destX, destY] = action.dest;
  if (def.move !== "none" && (destX !== unit.x || destY !== unit.y)) {
    const occupant = unitAt(next, destX, destY);
    if (occupant && occupant.id !== unit.id) return next;
    if (usesFuel(def)) {
      const spent = manhattan(unit.x, unit.y, destX, destY);
      unit.fuel = Math.max(0, curFuel(unit) - spent);
    }
    resetCaptureByUnit(next, unit.id);
    unit.x = destX;
    unit.y = destY;
  }
  switch (action.act.t) {
    case "wait": {
      resetCaptureByUnit(next, unit.id);
      break;
    }
    case "capture": {
      const tile = tileAt(next, unit.x, unit.y);
      if (def.canCapture && isCapturable(tile.terrain) && tile.owner !== unit.owner) {
        if (tile.capturingId !== null && tile.capturingId !== unit.id) tile.captureLeft = 20;
        tile.capturingId = unit.id;
        tile.captureLeft -= Math.max(1, hpStars(unit.hp));
        if (tile.captureLeft <= 0) {
          tile.owner = unit.owner;
          tile.captureLeft = 20;
          tile.capturingId = null;
          next.log.push(`${unit.owner.toUpperCase()} captured ${tile.isHQ ? "the enemy HQ" : `a ${terrainDef(tile.terrain).name}`}.`);
          if (tile.isHQ) next.winner = unit.owner;
        }
      }
      break;
    }
    case "attack": {
      const target = unitById(next, action.act.targetId);
      if (target && target.owner !== unit.owner && canTarget(unit, target)) {
        const ev = resolveAttack(next, unit, target);
        next.lastCombat.push(ev);
        removeDead(next);
      }
      break;
    }
    case "launch": {
      if (def.special === "icbm" && unit.cooldown <= 0) {
        const evs = resolveIcbm(next, unit, action.act.tx, action.act.ty);
        next.lastCombat.push(...evs);
        unit.cooldown = def.cooldownMax ?? 3;
        removeDead(next);
        next.log.push(`${unit.owner.toUpperCase()} launched an ICBM.`);
      }
      break;
    }
    case "unload": {
      const cargo = unit.cargo ?? [];
      const ci = action.act.cargoIdx;
      const carried = cargo[ci];
      const { tx, ty } = action.act;
      if (carried && inBounds(next, tx, ty) && !unitAt(next, tx, ty) && manhattan(unit.x, unit.y, tx, ty) === 1 && isFinite(moveCost(tileAt(next, tx, ty).terrain, unitDef(carried.type).move))) {
        next.units.push({ ...carried, x: tx, y: ty, acted: true, cargo: void 0 });
        unit.cargo = cargo.filter((_, i) => i !== ci);
      }
      break;
    }
    case "buildBridge": {
      const { tx, ty } = action.act;
      if (unit.type === "engineer" && inBounds(next, tx, ty) && manhattan(unit.x, unit.y, tx, ty) === 1) {
        const t = tileAt(next, tx, ty);
        if (t.terrain === "river") {
          t.terrain = "bridge";
          next.log.push(`${unit.owner.toUpperCase()} built a bridge.`);
        }
      }
      break;
    }
  }
  unit.acted = true;
  if (!next.winner) next.winner = computeWinner(next);
  return next;
}

// src/core/vision.ts
function computeVisible(state, owner) {
  const { width, height } = state;
  const vis = /* @__PURE__ */ new Set();
  const mark = (cx, cy, r) => {
    for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x++) {
        vis.add(y * width + x);
      }
    }
  };
  for (const u of state.units) {
    if (u.owner === owner) mark(u.x, u.y, unitDef(u.type).vision);
  }
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t.owner === owner && isIncomeProperty(t.terrain)) {
      const x = i % width;
      mark(x, (i - x) / width, 2);
    }
  }
  return vis;
}
function fogState(state, owner) {
  const vis = computeVisible(state, owner);
  const s = structuredClone(state);
  s.units = s.units.filter((u) => u.owner === owner || vis.has(u.y * s.width + u.x));
  for (let i = 0; i < s.tiles.length; i++) {
    if (vis.has(i)) continue;
    const t = s.tiles[i];
    t.captureLeft = 20;
    t.capturingId = null;
  }
  s.funds = { ...s.funds, [owner === "red" ? "blue" : "red"]: 0 };
  return s;
}

// src/core/agent.ts
function serializeView(state, you, fog = false) {
  const W2 = state.width;
  const vis = fog ? computeVisible(state, you) : null;
  const seen = (x, y) => !vis || vis.has(y * W2 + x);
  const tiles = state.tiles.map((t, i) => {
    const x = i % W2, y = (i - i % W2) / W2;
    const vis2 = seen(x, y);
    return {
      x,
      y,
      terrain: t.terrain,
      owner: t.owner,
      isHQ: t.isHQ,
      captureLeft: vis2 ? t.captureLeft : 20,
      // a fogged countdown would pinpoint a hidden capturer
      capturingId: vis2 ? t.capturingId : null,
      // hide who's capturing under fog (it'd leak a unit)
      visible: vis2
    };
  });
  const units = [];
  for (const u of state.units) {
    const mine = u.owner === you;
    if (!mine && !seen(u.x, u.y)) continue;
    units.push({
      id: u.id,
      type: u.type,
      owner: u.owner,
      mine,
      x: u.x,
      y: u.y,
      hp: u.hp,
      acted: u.acted,
      cooldown: u.cooldown,
      fuel: u.fuel,
      ammo: u.ammo,
      cargo: mine ? u.cargo?.length : void 0
      // enemy transport contents are hidden intel
    });
  }
  return {
    schemaVersion: 2,
    you,
    turn: state.turnCount,
    width: W2,
    height: state.height,
    funds: state.funds[you],
    tiles,
    units,
    legal: state.turnOwner === you ? legalMoves(fog ? fogState(state, you) : state) : [],
    winner: computeWinner(state)
  };
}
var UNIT_TYPES = [
  "infantry",
  "heavyInfantry",
  "engineer",
  "recon",
  "apc",
  "smallTank",
  "largeTank",
  "artillery",
  "lander",
  "helicopter",
  "drone",
  "stealthBomber",
  "seaFort",
  "icbm"
];
var COORD = { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 };
var ACTION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "PixelWarsAction",
  description: "One action a player emits. Choose ONE from the current legal-move list.",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "unitId", "dest", "act"],
      properties: {
        kind: { const: "unit" },
        unitId: { type: "integer" },
        dest: { ...COORD, description: "[x,y] move destination (== current pos to act in place)" },
        act: {
          oneOf: [
            { type: "object", additionalProperties: false, required: ["t"], properties: { t: { const: "wait" } } },
            { type: "object", additionalProperties: false, required: ["t", "targetId"], properties: { t: { const: "attack" }, targetId: { type: "integer" } } },
            { type: "object", additionalProperties: false, required: ["t"], properties: { t: { const: "capture" } } },
            { type: "object", additionalProperties: false, required: ["t", "tx", "ty"], properties: { t: { const: "launch" }, tx: { type: "integer" }, ty: { type: "integer" } } },
            { type: "object", additionalProperties: false, required: ["t", "transportId"], properties: { t: { const: "load" }, transportId: { type: "integer" } } },
            { type: "object", additionalProperties: false, required: ["t", "cargoIdx", "tx", "ty"], properties: { t: { const: "unload" }, cargoIdx: { type: "integer" }, tx: { type: "integer" }, ty: { type: "integer" } } },
            { type: "object", additionalProperties: false, required: ["t", "tx", "ty"], properties: { t: { const: "buildBridge" }, tx: { type: "integer" }, ty: { type: "integer" } } }
          ]
        }
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "x", "y", "unitType"],
      properties: {
        kind: { const: "build" },
        x: { type: "integer" },
        y: { type: "integer" },
        unitType: { type: "string", enum: UNIT_TYPES }
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: { kind: { const: "end" } }
    }
  ]
};
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
function looksLikeAction(a) {
  return !!a && typeof a === "object" && typeof a.kind === "string" && ["unit", "build", "end"].includes(a.kind);
}
function validateAction(state, you, action) {
  if (computeWinner(state)) return { ok: false, error: "the game is already over" };
  if (state.turnOwner !== you) return { ok: false, error: `not your turn (it is ${state.turnOwner}'s)` };
  if (!looksLikeAction(action)) return { ok: false, error: "malformed action (expected kind: unit|build|end)" };
  const legal = legalMoves(state);
  const match = legal.find((l) => deepEqual(l, action));
  if (!match) return { ok: false, error: "action is not in the current legal-move list" };
  return { ok: true, action: match };
}
function validateWireAction(state, you, action, fog, shownLegal) {
  if (!fog) return validateAction(state, you, action);
  if (computeWinner(state)) return { ok: false, error: "the game is already over" };
  if (state.turnOwner !== you) return { ok: false, error: `not your turn (it is ${state.turnOwner}'s)` };
  if (!looksLikeAction(action)) return { ok: false, error: "malformed action (expected kind: unit|build|end)" };
  const legal = shownLegal ?? legalMoves(fogState(state, you));
  if (!legal.some((l) => deepEqual(l, action))) {
    return { ok: false, error: "action is not in the current legal-move list" };
  }
  const res = validateAction(state, you, action);
  if (!res.ok) return { ok: false, error: "action is no longer legal \u2014 pick another from the current legal-move list" };
  return res;
}
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`agent timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(timer);
      resolve(v);
    }, (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}
function fallbackAction(legal) {
  const wait = legal.find((a) => a.kind === "unit" && a.act.t === "wait");
  return wait ?? { kind: "end" };
}
async function decide(state, you, agent, opts) {
  const fog = opts.fog ?? false;
  const maxRetries = opts.maxRetries ?? 2;
  let apiErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const view = serializeView(state, you, fog);
    let emitted;
    try {
      const p = Promise.resolve(agent.act(view, agent.local ? state : void 0));
      emitted = opts.timeoutMs ? await withTimeout(p, opts.timeoutMs) : await p;
    } catch (e) {
      if (e?.name === "ApiError") apiErr = e;
      emitted = void 0;
    }
    const res = validateWireAction(state, you, emitted, fog, view.legal.length ? view.legal : void 0);
    if (res.ok) return res.action;
    agent.onReject?.(view, emitted, res.error ?? "invalid action");
  }
  if (apiErr) throw apiErr;
  return fallbackAction(legalMoves(state));
}
async function runTurnBatched(state, agent, opts) {
  const you = state.turnOwner;
  const fog = opts.fog ?? false;
  const maxRetries = opts.maxRetries ?? 2;
  const actions = [];
  let work = state;
  const maxSteps = work.units.length + 8;
  let apiErr;
  let ended = false;
  let wasted = 0;
  while (actions.length < maxSteps && !ended && wasted <= maxRetries) {
    if (computeWinner(work)) {
      ended = true;
      break;
    }
    const view = serializeView(work, you, fog);
    let list;
    try {
      const p = Promise.resolve(agent.actTurn(view, agent.local ? work : void 0));
      list = opts.timeoutMs ? await withTimeout(p, opts.timeoutMs) : await p;
    } catch (e) {
      if (e?.name === "ApiError") apiErr = e;
      list = void 0;
    }
    if (!Array.isArray(list) || list.length === 0) {
      agent.onTurnReject?.(view, list, 'expected a non-empty array of actions ending with {kind:"end"}', actions.length);
      wasted++;
      continue;
    }
    let progressed = false;
    let skipped = false;
    for (const action of list) {
      if (actions.length >= maxSteps) break;
      const res = validateWireAction(work, you, action, fog);
      if (!res.ok) {
        skipped = true;
        continue;
      }
      work = applyAction(work, res.action);
      actions.push(res.action);
      opts.onAction?.(res.action, work);
      progressed = true;
      if (res.action.kind === "end") {
        ended = true;
        break;
      }
      if (computeWinner(work)) {
        ended = true;
        break;
      }
    }
    if (!ended) {
      agent.onTurnReject?.(view, list, skipped ? 'some planned actions were illegal by the time they ran and were skipped; emit the remaining moves, then {kind:"end"}' : 'your action list did not end the turn; emit the remaining moves, then {kind:"end"}', actions.length);
    }
    wasted = progressed ? 0 : wasted + 1;
  }
  if (apiErr && !ended && !computeWinner(work)) throw apiErr;
  if (!computeWinner(work) && actions[actions.length - 1]?.kind !== "end") {
    work = applyAction(work, { kind: "end" });
    actions.push({ kind: "end" });
  }
  return { state: work, actions };
}
async function runTurn(state, agent, opts = {}) {
  if (opts.batch && agent.actTurn) return runTurnBatched(state, agent, opts);
  const you = state.turnOwner;
  const actions = [];
  let work = state;
  const maxSteps = work.units.length + 8;
  for (let step = 0; step < maxSteps; step++) {
    if (computeWinner(work)) break;
    const action = await decide(work, you, agent, opts);
    work = applyAction(work, action);
    actions.push(action);
    opts.onAction?.(action, work);
    if (action.kind === "end") break;
  }
  if (!computeWinner(work) && actions[actions.length - 1]?.kind !== "end") {
    work = applyAction(work, { kind: "end" });
    actions.push({ kind: "end" });
  }
  return { state: work, actions };
}
function replay(state, log) {
  let work = state;
  for (const action of log) {
    const res = validateAction(work, work.turnOwner, action);
    if (!res.ok) throw new Error(`replay diverged: ${res.error} (action ${JSON.stringify(action)})`);
    work = applyAction(work, res.action);
  }
  return work;
}

// src/core/score.ts
function material(state, owner) {
  let m = 0;
  for (const u of state.units) if (u.owner === owner) m += unitDef(u.type).value * (u.hp / 100);
  return m;
}
function territory(state, owner) {
  let n = 0;
  for (const t of state.tiles) if (t.owner === owner && isIncomeProperty(t.terrain)) n++;
  return n;
}
var clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function pointsMargin(state) {
  const rm = material(state, "red"), bm = material(state, "blue");
  const rp = territory(state, "red"), bp = territory(state, "blue");
  const mat = (rm - bm) / Math.max(1, rm + bm);
  const terr = (rp - bp) / Math.max(1, rp + bp);
  let siege = 0;
  for (const t of state.tiles) {
    if (!t.isHQ || t.captureLeft >= 20 || t.capturingId === null) continue;
    const cap = state.units.find((u) => u.id === t.capturingId);
    if (cap) siege += (cap.owner === "red" ? 1 : -1) * ((20 - t.captureLeft) / 20);
  }
  return clamp(0.6 * mat + 0.3 * terr + 0.4 * clamp(siege, -1, 1), -1, 1);
}
function timeoutScoreRed(state) {
  return clamp(0.5 + 0.5 * Math.tanh(1.4 * pointsMargin(state)), 0.2, 0.8);
}
function outcomeScoreRed(state, winner) {
  if (winner === "red") return 1;
  if (winner === "blue") return 0;
  return timeoutScoreRed(state);
}
function outcomeScoreFor(state, seat, winner) {
  const red = outcomeScoreRed(state, winner);
  return seat === "red" ? red : 1 - red;
}

// src/ai/evaluate.ts
var DEFAULT_WEIGHTS = {
  material: 1,
  terrain: 0.5,
  capture: 60,
  city: 10,
  advance: 0.8,
  win: 1e6,
  property: 0,
  funds: 0,
  hqDefense: 0,
  captureSeek: 0,
  hqGuard: 0,
  buildValue: 0,
  homeGuard: 0
  // legacy tiers: no v3/v4/v5 terms
};
var V3_WEIGHTS = {
  material: 1,
  terrain: 0.5,
  capture: 60,
  city: 10,
  // same as DEFAULT (calibrated) — city/hq valuation unchanged
  advance: 0.8,
  win: 1e6,
  property: 6,
  // NEW value for bases/airports/ports (DEFAULT ignored these)
  funds: 2e-3,
  hqDefense: 3,
  captureSeek: 0.6,
  hqGuard: 40,
  // occupy-the-HQ reward under a real rush (fixes the 23-turn HQ-rush loss)
  buildValue: 0,
  // v3 is building-type-blind (the gap v4 fixes)
  homeGuard: 0
  // v3 is REACTIVE on HQ defence (the gap v5 fixes)
};
var COMMANDER_V3_WEIGHTS = {
  ...V3_WEIGHTS,
  hqDefense: 6,
  // was 3 — react harder as an enemy capturer closes on our HQ
  hqGuard: 60
  // was 40 — stronger pull to physically garrison the HQ under a rush
};
var COMMANDER_V4_WEIGHTS = {
  ...COMMANDER_V3_WEIGHTS,
  buildValue: 10,
  // ≈ half a smallTank per (threat×scarcity) unit; tuned via test/league.ts
  homeGuard: 20
  // keep one reserve within HOME_GUARD_R of my HQ; tuned via test/league.ts
};
var HOME_GUARD_R = 3;
var BUILDING_THREAT = { airport: 1, port: 0.91, base: 0.8 };
var SCARCITY_K = 2;
function enemyHQ(state, me) {
  const enemy = OTHER[me];
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t.isHQ && t.owner === enemy) {
      const x = i % state.width;
      return [x, (i - x) / state.width];
    }
  }
  return null;
}
function evaluate(state, me, w = DEFAULT_WEIGHTS) {
  const enemy = OTHER[me];
  if (state.winner === me) return w.win;
  if (state.winner === enemy) return -w.win;
  let s = 0;
  for (const u of state.units) {
    const def = unitDef(u.type);
    const hp = u.hp / 100;
    let v = def.value * hp * w.material;
    const tile = state.tiles[u.y * state.width + u.x];
    if (def.move !== "air") v += terrainDef(tile.terrain).defenseStars * hp * w.terrain;
    s += u.owner === me ? v : -v;
  }
  const prodCount = { base: 0, airport: 0, port: 0 };
  if (w.buildValue) {
    for (const t of state.tiles) if (t.terrain in prodCount) prodCount[t.terrain]++;
  }
  const buildScale = (terrain) => {
    const th = BUILDING_THREAT[terrain];
    if (!w.buildValue || th === void 0) return 0;
    return th * (1 + SCARCITY_K / Math.max(1, prodCount[terrain]));
  };
  let myHQ = null;
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t.isHQ && t.owner === me) {
      const x = i % state.width;
      myHQ = [x, (i - x) / state.width];
    }
    if (!isIncomeProperty(t.terrain)) continue;
    const isCityHQ = t.terrain === "city" || t.terrain === "hq";
    const bScale = buildScale(t.terrain);
    const val = (isCityHQ ? w.city : w.property) + w.buildValue * bScale;
    if (t.owner === me) s += val;
    else if (t.owner === enemy) s -= val;
    if (t.capturingId !== null && (isCityHQ || w.property > 0 || bScale > 0)) {
      const cu = state.units.find((u) => u.id === t.capturingId);
      if (cu) {
        const progress = (20 - t.captureLeft) / 20;
        s += (cu.owner === me ? 1 : -1) * progress * w.capture * (bScale > 0 ? bScale : 1);
      }
    }
  }
  const ehq = enemyHQ(state, me);
  if (ehq) {
    for (const u of state.units) {
      if (u.owner !== me) continue;
      const def = unitDef(u.type);
      if (def.move === "none") continue;
      const d = manhattan(u.x, u.y, ehq[0], ehq[1]);
      s -= d * w.advance * (def.canCapture ? 1.5 : 1);
    }
  }
  if (w.funds) s += (state.funds[me] - state.funds[enemy]) * w.funds;
  if ((w.hqDefense || w.hqGuard) && myHQ) {
    let nearCap = Infinity;
    for (const u of state.units) {
      if (u.owner !== enemy || !unitDef(u.type).canCapture) continue;
      const d = manhattan(u.x, u.y, myHQ[0], myHQ[1]);
      if (d < nearCap) nearCap = d;
    }
    if (isFinite(nearCap)) {
      if (w.hqDefense) s -= w.hqDefense * Math.max(0, 6 - nearCap);
      if (w.hqGuard && nearCap <= 4 && state.units.some((u) => u.owner === me && u.x === myHQ[0] && u.y === myHQ[1])) {
        s += w.hqGuard;
      }
    }
  }
  if (w.homeGuard && myHQ && state.units.some(
    (u) => u.owner === me && manhattan(u.x, u.y, myHQ[0], myHQ[1]) <= HOME_GUARD_R
  )) {
    s += w.homeGuard;
  }
  if (w.captureSeek) {
    const targets = [];
    for (let i = 0; i < state.tiles.length; i++) {
      const t = state.tiles[i];
      if (isIncomeProperty(t.terrain) && t.owner !== me) {
        const x = i % state.width;
        const wgt = 1 + buildScale(t.terrain);
        targets.push([x, (i - x) / state.width, wgt]);
      }
    }
    if (targets.length) {
      for (const u of state.units) {
        if (u.owner !== me || !unitDef(u.type).canCapture) continue;
        let nd = Infinity;
        for (const [tx, ty, wgt] of targets) {
          const d = manhattan(u.x, u.y, tx, ty) / wgt;
          if (d < nd) nd = d;
        }
        if (isFinite(nd)) s -= w.captureSeek * nd;
      }
    }
  }
  return s;
}

// src/ai/threat.ts
function representativeDamage(unit) {
  const vals = Object.values(unitDef(unit.type).damage);
  if (!vals.length) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return avg * (unit.hp / 100);
}
function computeThreat(state, attackerOwner) {
  const { width, height } = state;
  const threat = new Float64Array(width * height);
  for (const attacker of state.units) {
    if (attacker.owner !== attackerOwner) continue;
    const def = unitDef(attacker.type);
    if (def.special === "icbm") continue;
    const rep = representativeDamage(attacker);
    if (rep <= 0) continue;
    const stops = [];
    if (def.move === "none" || def.movePoints <= 0) {
      stops.push(attacker.y * width + attacker.x);
    } else {
      const reach = computeReach(state, attacker);
      for (const k of reach.cost.keys()) stops.push(k);
    }
    const hit = /* @__PURE__ */ new Set();
    for (const sk of stops) {
      const sx = sk % width;
      const sy = (sk - sx) / width;
      const lo = def.minRange;
      const hi = def.maxRange === 999 ? 4 : def.maxRange;
      for (let ty = Math.max(0, sy - hi); ty <= Math.min(height - 1, sy + hi); ty++) {
        for (let tx = Math.max(0, sx - hi); tx <= Math.min(width - 1, sx + hi); tx++) {
          const d = manhattan(sx, sy, tx, ty);
          if (d < lo || d > hi) continue;
          hit.add(ty * width + tx);
        }
      }
    }
    for (const k of hit) threat[k] += rep;
  }
  return threat;
}

// src/ai/ai.ts
var COMMANDER_VERSION = "commander-v1.3";
var TIERS = {
  easy: {
    name: "Lieutenant",
    considerThreat: false,
    topK: 6,
    blunderRate: 0.45,
    threatAvoid: 0.1,
    weights: DEFAULT_WEIGHTS
  },
  medium: {
    name: "Major",
    considerThreat: true,
    topK: 6,
    blunderRate: 0.22,
    threatAvoid: 0.3,
    weights: DEFAULT_WEIGHTS
  },
  hard: {
    name: "Colonel",
    considerThreat: true,
    topK: 8,
    blunderRate: 0.09,
    threatAvoid: 0.34,
    weights: DEFAULT_WEIGHTS,
    lookahead: true
  },
  // THE live anchor = commander-v1.3 (COMMANDER_V4_WEIGHTS: building control + proactive HQ defence, both folded in).
  // Harden it between numbered versions against the free bot roster + human games.
  ultimate: {
    name: "Commander",
    considerThreat: true,
    topK: 12,
    blunderRate: 0,
    threatAvoid: 0.38,
    weights: COMMANDER_V4_WEIGHTS,
    lookahead: true,
    v3eco: true,
    commanderV3: true
  },
  // FROZEN commander-v1.2 — kept for regression A/B. NOT the live anchor.
  "ultimate-v3": {
    name: "Commander v3",
    considerThreat: true,
    topK: 12,
    blunderRate: 0,
    threatAvoid: 0.38,
    weights: COMMANDER_V3_WEIGHTS,
    lookahead: true,
    v3eco: true,
    commanderV3: true
  },
  // FROZEN commander-v1.1 — earlier anchor, kept for regression A/B.
  "ultimate-v2": {
    name: "Commander v2",
    considerThreat: true,
    topK: 12,
    blunderRate: 0,
    threatAvoid: 0.38,
    weights: V3_WEIGHTS,
    lookahead: true,
    v3eco: true
  }
};
function desiredCapturers(state, owner) {
  let grabbable = 0;
  for (const t of state.tiles) {
    if (isIncomeProperty(t.terrain) && t.owner !== owner) grabbable++;
  }
  return Math.max(2, Math.min(4, Math.ceil(grabbable / 4)));
}
function chooseBuildLegacy(state, owner, buildList) {
  const funds = state.funds[owner];
  const own = state.units.filter((u) => u.owner === owner);
  const capturers = own.filter((u) => unitDef(u.type).canCapture).length;
  const infCost = unitDef("infantry").cost ?? 1e3;
  if (capturers < 2 && funds >= infCost && buildList.includes("infantry")) return "infantry";
  let best = null;
  let bestV = -1;
  for (const t of buildList) {
    const d = unitDef(t);
    if (Object.keys(d.damage).length === 0) continue;
    const c = d.cost ?? Infinity;
    if (c <= funds && d.value > bestV) {
      bestV = d.value;
      best = t;
    }
  }
  return best;
}
function chooseBuild(state, owner, buildList) {
  const funds = state.funds[owner];
  const opts = buildList.filter((t) => {
    const d = unitDef(t);
    if ((d.cost ?? Infinity) > funds) return false;
    return d.canCapture || Object.keys(d.damage).length > 0;
  });
  if (!opts.length) return null;
  const own = state.units.filter((u) => u.owner === owner);
  const byValueDesc = (a, b) => unitDef(b).value - unitDef(a).value;
  const capturerOpts = opts.filter((t) => unitDef(t).canCapture);
  if (capturerOpts.length) {
    const capturers = own.filter((u) => unitDef(u.type).canCapture).length;
    if (capturers < desiredCapturers(state, owner)) {
      return capturerOpts.sort((a, b) => (unitDef(a).cost ?? 0) - (unitDef(b).cost ?? 0))[0];
    }
  }
  const enemy = owner === "red" ? "blue" : "red";
  if (state.units.some((u) => u.owner === enemy && isAir(u.type)) && !own.some((u) => (unitDef(u.type).damage.air ?? 0) > 0)) {
    const airHitters = opts.filter((t) => (unitDef(t).damage.air ?? 0) > 0).sort(byValueDesc);
    if (airHitters.length) return airHitters[0];
  }
  const ownDirect = own.filter((u) => {
    const d = unitDef(u.type);
    return !d.indirect && !d.canCapture && Object.keys(d.damage).length > 0;
  }).length;
  const ownIndirect = own.filter((u) => unitDef(u.type).indirect).length;
  const direct = opts.filter((t) => !unitDef(t).indirect);
  const pool = ownIndirect < ownDirect ? opts : direct.length ? direct : opts;
  return pool.sort(byValueDesc)[0];
}
function chooseBuildV3(state, owner, buildList) {
  const funds = state.funds[owner];
  const opts = buildList.filter((t) => {
    const d = unitDef(t);
    if ((d.cost ?? Infinity) > funds) return false;
    return d.canCapture || Object.keys(d.damage).length > 0;
  });
  if (!opts.length) return null;
  const own = state.units.filter((u) => u.owner === owner);
  const enemy = owner === "red" ? "blue" : "red";
  const capturerOpts = opts.filter((t) => unitDef(t).canCapture);
  if (capturerOpts.length) {
    const capturers = own.filter((u) => unitDef(u.type).canCapture).length;
    if (capturers < desiredCapturers(state, owner)) {
      return capturerOpts.sort((a, b) => (unitDef(a).cost ?? 0) - (unitDef(b).cost ?? 0))[0];
    }
  }
  const enemyAir = state.units.filter((u) => u.owner === enemy && isAir(u.type)).length;
  const ourAirHit = own.filter((u) => (unitDef(u.type).damage.air ?? 0) > 0).length;
  if (enemyAir > ourAirHit) {
    const airHitters = opts.filter((t) => (unitDef(t).damage.air ?? 0) > 0).sort((a, b) => unitDef(b).value - unitDef(a).value);
    if (airHitters.length) return airHitters[0];
  }
  const combat = opts.filter((t) => !unitDef(t).canCapture && Object.keys(unitDef(t).damage).length > 0);
  const pickPool = combat.length ? combat : opts;
  const ownDirect = own.filter((u) => {
    const d = unitDef(u.type);
    return !d.indirect && !d.canCapture && Object.keys(d.damage).length > 0;
  }).length;
  const ownIndirect = own.filter((u) => unitDef(u.type).indirect).length;
  const direct = pickPool.filter((t) => !unitDef(t).indirect);
  const pool = ownIndirect < ownDirect ? pickPool : direct.length ? direct : pickPool;
  return pool.sort((a, b) => unitDef(b).value - unitDef(a).value)[0];
}
function foggedView(state, owner) {
  return fogState(state, owner);
}
function produce(state, owner, actions, v3eco, commanderV3 = false) {
  let work = state;
  const order = v3eco ? ["base", "airport", "port"] : ["base"];
  for (const kind of order) {
    for (let i = 0; i < work.tiles.length; i++) {
      const t = work.tiles[i];
      if (t.owner !== owner || t.terrain !== kind) continue;
      const list = buildListFor(t.terrain);
      if (!list.length) continue;
      const x = i % work.width;
      const y = (i - x) / work.width;
      if (unitAt(work, x, y)) continue;
      const type = commanderV3 ? chooseBuildV3(work, owner, list) : v3eco ? chooseBuild(work, owner, list) : chooseBuildLegacy(work, owner, list);
      if (!type) continue;
      const a = { kind: "build", x, y, unitType: type };
      work = applyAction(work, a);
      actions.push(a);
    }
  }
  return work;
}
var COMBAT_W = 1.6;
function combatValue(before, after, me) {
  let v = 0;
  for (const b of before.units) {
    const a = after.units.find((u) => u.id === b.id);
    const def = unitDef(b.type);
    const lostHp = (a ? b.hp - a.hp : b.hp) / 100;
    if (lostHp <= 0) continue;
    const killed = !a;
    if (b.owner === me) {
      v -= lostHp * def.value * 1.1;
    } else {
      v += lostHp * def.value + (killed ? def.value : 0);
    }
  }
  return v;
}
function exposureRisk(threat, hp, value) {
  return Math.min(threat, hp) / 100 * value;
}
var FUEL_RETURN_W = 2.5;
function fuelUrgency(u) {
  const def = unitDef(u.type);
  if (!usesFuel(def) || def.fuelMax == null) return 0;
  const frac = curFuel(u) / def.fuelMax;
  if (frac >= 0.4) return 0;
  return (0.4 - frac) / 0.4;
}
function resupplyTiles(state, owner) {
  const out = [];
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t.owner === owner && isIncomeProperty(t.terrain)) out.push(i);
  }
  return out;
}
function nearestResupplyDist(tiles, width, x, y) {
  let best = Infinity;
  for (const k of tiles) {
    const tx = k % width, ty = (k - k % width) / width;
    const d = Math.abs(tx - x) + Math.abs(ty - y);
    if (d < best) best = d;
  }
  return isFinite(best) ? best : 0;
}
function enemyStrikeMap(state, enemyOwner, mover) {
  const W2 = state.width, H2 = state.height;
  const map = /* @__PURE__ */ new Map();
  const mArmor = unitDef(mover.type).armor;
  const mAir = isAir(mover.type);
  for (const e of state.units) {
    if (e.owner !== enemyOwner) continue;
    const eDef = unitDef(e.type);
    const base = eDef.damage[mArmor];
    if (base === void 0) continue;
    const raw = base * (e.hp / 100);
    let stops;
    if (eDef.indirect || eDef.move === "none" || eDef.movePoints <= 0) {
      stops = [e.y * W2 + e.x];
    } else {
      stops = [...computeReach(state, e).cost.keys()];
    }
    const lo = eDef.minRange, hi = eDef.maxRange === 999 ? 4 : eDef.maxRange;
    for (const sk of stops) {
      const sx = sk % W2, sy = (sk - sx) / W2;
      for (let ty = Math.max(0, sy - hi); ty <= Math.min(H2 - 1, sy + hi); ty++) {
        for (let tx = Math.max(0, sx - hi); tx <= Math.min(W2 - 1, sx + hi); tx++) {
          const d = Math.abs(sx - tx) + Math.abs(sy - ty);
          if (d < lo || d > hi) continue;
          const k = ty * W2 + tx;
          const defStars = mAir ? 0 : terrainDef(state.tiles[k].terrain).defenseStars;
          const dmg = Math.max(0, Math.round(raw * (1 - defStars * 0.1)));
          if (dmg > (map.get(k) ?? 0)) map.set(k, dmg);
        }
      }
    }
  }
  return map;
}
function planTurn(state, owner, difficulty, fog = false) {
  const cfg = TIERS[difficulty];
  const rng = new Rng(state.rngState ^ state.turnCount * 2654435761);
  const actions = [];
  const base = fog ? foggedView(state, owner) : state;
  const enemy = owner === "red" ? "blue" : "red";
  const scrubFogWin = (s) => {
    if (fog && s.winner === owner && s.tiles.some((t) => t.isHQ && t.owner === enemy)) s.winner = null;
    return s;
  };
  let work = scrubFogWin(produce(base, owner, actions, !!cfg.v3eco, !!cfg.commanderV3));
  const maxSteps = state.units.length + 8;
  for (let step = 0; step < maxSteps; step++) {
    if (work.winner) break;
    const active = activeUnits(work, owner).slice().sort(
      (a, b) => unitDef(b.type).value - unitDef(a.type).value
    );
    if (!active.length) break;
    const unit = active[0];
    const candidates = unitActions(work, unit.id);
    if (!candidates.length) {
      work = applyAction(work, { kind: "unit", unitId: unit.id, dest: [unit.x, unit.y], act: { t: "wait" } });
      continue;
    }
    const enemyOwner = owner === "red" ? "blue" : "red";
    const strike = cfg.lookahead ? enemyStrikeMap(work, enemyOwner, unit) : null;
    const threat = cfg.considerThreat && !strike ? computeThreat(work, enemyOwner) : null;
    const moverValue = unitDef(unit.type).value;
    const urgency = fuelUrgency(unit);
    const fuelHomeMult = urgency > 0 ? (isAir(unit.type) ? 2 : 1) * urgency : 0;
    const supply = fuelHomeMult > 0 ? resupplyTiles(work, owner) : null;
    const scored = candidates.map((action) => {
      const after = scrubFogWin(applyAction(work, action));
      let s = evaluate(after, owner, cfg.weights);
      const isCombat = action.kind === "unit" && (action.act.t === "attack" || action.act.t === "launch");
      if (isCombat) s += COMBAT_W * combatValue(work, after, owner);
      if ((strike || threat) && action.kind === "unit") {
        const survivor = after.units.find((u) => u.id === unit.id);
        if (survivor) {
          const k = idx(after, survivor.x, survivor.y);
          const exposure = strike ? strike.get(k) ?? 0 : threat[k];
          if (exposure > 0) s -= exposureRisk(exposure, survivor.hp, moverValue) * cfg.threatAvoid;
        }
      }
      if (supply && action.kind === "unit") {
        const survivor = after.units.find((u) => u.id === unit.id);
        if (survivor) {
          const d = nearestResupplyDist(supply, after.width, survivor.x, survivor.y);
          s -= FUEL_RETURN_W * fuelHomeMult * d;
        }
      }
      return { action, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    let chosen = scored[0];
    if (cfg.blunderRate > 0 && scored.length > 1 && rng.next() < cfg.blunderRate) {
      const poolEnd = Math.min(cfg.topK, scored.length);
      const j = 1 + rng.int(poolEnd - 1);
      chosen = scored[j];
    }
    work = scrubFogWin(applyAction(work, chosen.action));
    actions.push(chosen.action);
  }
  work = scrubFogWin(applyAction(work, { kind: "end" }));
  actions.push({ kind: "end" });
  return { actions, finalState: work };
}

// src/ai/classicalAgent.ts
var ClassicalAgent = class {
  constructor(difficulty, opts = {}) {
    this.local = true;
    this.queue = [];
    this.planKey = "";
    this.difficulty = difficulty;
    this.fog = opts.fog ?? false;
    this.name = opts.name ?? `Classical:${difficulty}`;
  }
  // Local agent: uses the trusted referee `state` to plan (the lossy wire `view`
  // alone can't reconstruct full game state — fuel, capture progress, etc.).
  act(view, state) {
    if (!state) {
      throw new Error("ClassicalAgent needs the local referee state (it is an in-process agent)");
    }
    const key = `${view.you}:${view.turn}`;
    if (key !== this.planKey || this.queue.length === 0) {
      this.planKey = key;
      this.queue = planTurn(state, view.you, this.difficulty, this.fog).actions.slice();
    }
    return this.queue.shift() ?? { kind: "end" };
  }
};

// server/src/referee.ts
var ANCHOR = "ultimate";
var ANCHOR_VERSION = COMMANDER_VERSION;
var BENCH_COMPLEXITY = 12;
var BENCH_TURN_CAP = 200;
var Referee = class {
  games = /* @__PURE__ */ new Map();
  async newGame(opts) {
    if (opts.side !== void 0 && opts.side !== "red" && opts.side !== "blue") {
      throw new Error(`invalid side: ${JSON.stringify(opts.side)} (must be 'red' or 'blue')`);
    }
    if (!THEMES.some((t) => t.id === opts.theme)) {
      throw new Error(`unknown theme: ${JSON.stringify(opts.theme)} (must be one of ${THEMES.map((t) => t.id).join(", ")})`);
    }
    if (!Number.isInteger(opts.seed)) throw new Error(`invalid seed: ${JSON.stringify(opts.seed)} (must be an integer)`);
    const modelSeat = opts.side ?? "red";
    const params = { theme: opts.theme, complexity: opts.complexity ?? BENCH_COMPLEXITY, seed: opts.seed };
    const g = {
      matchId: randomUUID(),
      params,
      modelSeat,
      turnCap: opts.turnCap ?? BENCH_TURN_CAP,
      agent: new ClassicalAgent(ANCHOR, { fog: true }),
      state: generateState(params),
      log: [],
      seatTurns: 0,
      done: false
    };
    this.games.set(g.matchId, g);
    await this.advanceOpponent(g);
    return this.snapshot(g, true);
  }
  // Submit ONE action for the model's seat. Multiple actions compose a turn; play `end` to pass control,
  // after which the Commander plays its full turn(s) before this returns the model's next view.
  async apply(matchId, action) {
    const g = this.games.get(matchId);
    if (!g) throw new Error(`unknown matchId: ${matchId}`);
    if (g.done) return this.snapshot(g, true);
    const res = validateWireAction(g.state, g.modelSeat, action, true);
    if (!res.ok) return { ...this.snapshot(g, false), error: res.error };
    g.state = applyAction(g.state, res.action);
    g.log.push(res.action);
    if (!computeWinner(g.state) && g.state.turnOwner !== g.modelSeat) g.seatTurns++;
    await this.advanceOpponent(g);
    return this.snapshot(g, true);
  }
  // Independent replay verification: a game === params + log. Never throws (errors are returned).
  verify(params, log) {
    try {
      const start = generateState({ theme: params.theme, complexity: params.complexity ?? BENCH_COMPLEXITY, seed: params.seed });
      const final = replay(start, log);
      const winner = computeWinner(final);
      return { ok: true, winner, score: outcomeScoreFor(final, params.side ?? "red", winner), turnCount: final.turnCount };
    } catch (e) {
      return { ok: false, winner: null, score: null, turnCount: 0, error: e.message };
    }
  }
  // The seed + action log so far — a replay-verifiable record of the game to store alongside the result.
  record(matchId) {
    const g = this.games.get(matchId);
    if (!g) throw new Error(`unknown matchId: ${matchId}`);
    return { params: g.params, log: g.log.slice(), modelSeat: g.modelSeat };
  }
  // Play out the Commander (via the canonical runTurn runner) while it's their turn, the game is live,
  // and the seat-turn cap allows. Bounded by turnCap (each iteration increments seatTurns).
  async advanceOpponent(g) {
    while (!computeWinner(g.state) && g.state.turnOwner !== g.modelSeat && g.seatTurns < g.turnCap) {
      const r = await runTurn(g.state, g.agent, { fog: true });
      g.state = r.state;
      for (const a of r.actions) g.log.push(a);
      g.seatTurns++;
    }
    if (computeWinner(g.state) || g.seatTurns >= g.turnCap) g.done = true;
  }
  snapshot(g, ok) {
    const winner = computeWinner(g.state);
    return {
      ok,
      matchId: g.matchId,
      view: serializeView(g.state, g.modelSeat, true),
      done: g.done,
      winner,
      score: g.done ? outcomeScoreFor(g.state, g.modelSeat, winner) : null,
      turnCount: g.state.turnCount,
      seatTurns: g.seatTurns,
      anchor: ANCHOR_VERSION
    };
  }
};

// src/agents/llm/prompt.ts
var TERRAIN_GLYPH = {
  plain: ".",
  road: "=",
  forest: "f",
  mountain: "^",
  river: "~",
  bridge: "#",
  sea: "S",
  reef: "r",
  city: "c",
  base: "b",
  airport: "a",
  port: "p",
  seafort: "F",
  hq: "H"
};
var ALL_UNITS = [
  "infantry",
  "heavyInfantry",
  "engineer",
  "recon",
  "apc",
  "smallTank",
  "largeTank",
  "artillery",
  "lander",
  "helicopter",
  "drone",
  "stealthBomber",
  "seaFort",
  "icbm"
];
var ALL_TERRAIN = [
  "plain",
  "road",
  "forest",
  "mountain",
  "river",
  "bridge",
  "sea",
  "reef",
  "city",
  "base",
  "airport",
  "port",
  "seafort",
  "hq"
];
var cachedRulebook = null;
function rulebook() {
  if (cachedRulebook) return cachedRulebook;
  const units = ALL_UNITS.map((t) => {
    const d = unitDef(t);
    const dmg = Object.entries(d.damage).map(([k, v]) => `${k}:${v}`).join(" ");
    const rng = d.minRange === d.maxRange ? `${d.minRange}` : `${d.minRange}-${d.maxRange}`;
    const carry = d.capacity ? ` carries=${d.capacity}\xD7{${(d.carries ?? ["foot"]).join("/")}}` : "";
    return `  ${t} (${d.abbr}): move=${d.move}/${d.movePoints} vision=${d.vision} armor=${d.armor} rng=${rng} value=${d.value}${d.cost ? ` cost=${d.cost}` : ""}${d.fuelMax ? ` fuel=${d.fuelMax}` : ""}${d.ammoMax ? ` ammo=${d.ammoMax}` : ""}${carry}${d.canCapture ? " CAN-CAPTURE" : ""}${d.indirect ? " INDIRECT" : ""}${d.cooldownMax ? ` cooldown=${d.cooldownMax}` : ""}${dmg ? ` dmg[${dmg}]` : " UNARMED"}`;
  }).join("\n");
  const terrain = ALL_TERRAIN.map((t) => {
    const d = terrainDef(t);
    const costs = ["foot", "wheel", "tread", "air", "sea"].map((m) => `${m}:${isFinite(d.cost[m]) ? d.cost[m] : "X"}`).join(" ");
    return `  ${t} (${TERRAIN_GLYPH[t]}): def=${d.defenseStars}* move[${costs}]`;
  }).join("\n");
  cachedRulebook = [
    "You are playing Pixel Wars, a deterministic Advance-Wars-like turn-based tactics game.",
    "Goal: capture the enemy HQ (move a capture-capable unit onto it and capture over turns)",
    "or eliminate all enemy units. You and the enemy have identical rules, vision and funds.",
    "",
    "Each turn you emit ONE action at a time; after each, you get an updated board until you end.",
    "You will be given the exact LEGAL ACTIONS available right now \u2014 emit ONE of them, as a JSON",
    "object matching this schema (no prose, JSON only):",
    JSON.stringify(ACTION_SCHEMA),
    "",
    'Coordinates are [x,y], x=column (0=left), y=row (0=top). "dest" is where the unit moves to',
    "(== its current position to act in place). Movement cost X = impassable for that move class.",
    "Under fog the legal list reflects only what YOU can see: hidden enemies are never listed or",
    "targetable, and a listed move can still be interrupted by something unseen \u2014 it is then",
    "rejected and you simply pick again from the refreshed list. Territory ownership is common",
    "knowledge; enemy positions inside fog, capture progress there, and enemy funds are not.",
    "Fuel burns 1 per tile of straight-line (Manhattan) distance moved, regardless of terrain.",
    "",
    "UNITS (move=class/points; vision=fog sight radius; rng=min-max fire range; fuel/ammo shown ONLY if limited",
    "\u2014 absent = never strands / unlimited ammo; carries=N\xD7{move-classes} = transport capacity; dmg[class:%] vs",
    "each target armor class \u2014 absent class = cannot hit it):",
    units,
    "",
    "TERRAIN (move cost per class; def* = defense stars, reduces damage taken):",
    terrain
  ].join("\n");
  return cachedRulebook;
}

// server/src/referee-cli.ts
var ref = new Referee();
var rl = createInterface({ input: process.stdin, terminal: false });
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
async function handle(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    send({ ok: false, error: "invalid JSON" });
    return;
  }
  try {
    switch (msg.cmd) {
      case "new":
        send(await ref.newGame({
          seed: msg.seed,
          theme: msg.theme,
          complexity: msg.complexity,
          side: msg.side,
          turnCap: msg.turnCap
        }));
        break;
      case "apply":
        send(await ref.apply(msg.matchId, msg.action));
        break;
      case "verify":
        send(ref.verify(
          { theme: msg.theme, complexity: msg.complexity, seed: msg.seed, side: msg.side },
          msg.log
        ));
        break;
      case "record":
        send(ref.record(msg.matchId));
        break;
      case "ping":
        send({ ok: true, anchor: ANCHOR_VERSION });
        break;
      case "rules":
        send({ ok: true, rules: rulebook(), anchor: ANCHOR_VERSION });
        break;
      case "close":
      case "exit":
        rl.close();
        break;
      default:
        send({ ok: false, error: `unknown cmd: ${String(msg.cmd)}` });
    }
  } catch (e) {
    send({ ok: false, error: e.message });
  }
}
var queue = Promise.resolve();
rl.on("line", (line) => {
  queue = queue.then(() => handle(line));
});
rl.on("close", () => process.exit(0));
