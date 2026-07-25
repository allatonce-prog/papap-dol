// ============================================================
//  PAPAP DOL — Game Constants
// ============================================================

// --- Grid ---
export const TILE_SIZE     = 48;   // pixels per tile
export const GRID_W        = 13;   // tiles wide
export const GRID_H        = 11;   // tiles tall
export const CANVAS_W      = TILE_SIZE * GRID_W;  // 624
export const CANVAS_H      = TILE_SIZE * GRID_H;  // 528

// --- Tile types ---
export const TILE_EMPTY = 0;
export const TILE_WALL  = 1;
export const TILE_CRATE = 2;

// --- Player defaults ---
export const DEFAULT_SPEED          = 220;  // px/s (super fast gameplay)
export const SPEED_BOOST_AMOUNT     = 55;   // px/s per Speed Up
export const DEFAULT_BOMB_CAPACITY  = 1;
export const DEFAULT_EXPLOSION_RANGE= 1;    // tiles in each direction

// --- Hitbox (fraction of tile) ---
export const HITBOX = 0.72;

// --- Bomb ---
export const BOMB_FUSE_MS     = 3000;   // ms until explosion
export const CHAIN_DELAY_MS   = 80;     // ms between chain explosions
export const EXPLOSION_FADE_MS= 600;    // ms explosion visible

// --- Power-ups ---
export const POWERUP_LIFETIME_MS = 10000; // ms before disappearing
export const POWERUP_SPAWN_CHANCE= 0.35;  // probability per destroyed crate

// --- Networking ---
export const SYNC_INTERVAL_MS = 67;   // ~15 fps

// --- Spawn positions (tile x/y) ---
export const SPAWN_POSITIONS = [
  { x: 1,  y: 1  },  // P1 – top-left
  { x: 11, y: 1  },  // P2 – top-right
  { x: 1,  y: 9  },  // P3 – bottom-left
  { x: 11, y: 9  },  // P4 – bottom-right
];

// Tiles around each spawn kept crate-free
export const SPAWN_SAFE_TILES = new Set([
  '1,1','2,1','1,2',
  '11,1','10,1','11,2',
  '1,9','2,9','1,8',
  '11,9','10,9','11,8',
]);

// --- Player colors (index matches SPAWN_POSITIONS) ---
export const PLAYER_COLORS = ['#00d4ff', '#ff4466', '#44ff88', '#ffcc00'];
export const PLAYER_DARK   = ['#0066aa', '#aa0022', '#008844', '#aa8800'];
export const PLAYER_AVATARS= ['🙂', '😎', '😀', '🤩'];

// --- Power-up types ---
export const POWERUP = {
  BOMB  : 'bomb',
  FIRE  : 'fire',
  SPEED : 'speed',
  SHIELD: 'shield',
  KICK  : 'kick',
  REMOTE: 'remote',
  GHOST : 'ghost',
  LIFE  : 'life',
};

export const POWERUP_EMOJI = {
  bomb  : '💣',
  fire  : '🔥',
  speed : '⚡',
  shield: '🛡️',
  kick  : '🦵',
  remote: '⏰',
  ghost : '👻',
  life  : '❤️',
};

export const POWERUP_COLOR = {
  bomb  : '#ff6600',
  fire  : '#ff3300',
  speed : '#00ccff',
  shield: '#8866ff',
  kick  : '#ff9900',
  remote: '#ffcc00',
  ghost : '#aaddff',
  life  : '#ff4488',
};

// Weighted pool (common items appear more often)
export const POWERUP_POOL = [
  'bomb','bomb','bomb',
  'fire','fire','fire','fire',
  'speed','speed','speed',
  'kick',
  'remote',
  'ghost',
];

// --- Screen IDs ---
export const SCREEN = {
  NICKNAME: 'nickname-screen',
  MENU    : 'menu-screen',
  PLAY    : 'play-screen',
  BROWSE  : 'browse-screen',
  CREATE  : 'create-screen',
  LOBBY   : 'lobby-screen',
  GAME    : 'game-screen',
  WINNER  : 'winner-screen',
};

// --- Available maps ---
export const MAPS = ['Classic', 'Ice', 'Desert', 'Volcano', 'Factory'];

// --- Random room name parts ---
export const ROOM_ADJECTIVES = [
  'Blast','Bomb','Chaos','Fire','TNT','Flash','Thunder',
  'Neon','Shadow','Smoke','Inferno','Toxic','Turbo','Wild',
];
export const ROOM_NOUNS = [
  'Zone','Room','Arena','House','Den','Pit','Bunker',
  'Lab','Base','Field','Chamber','Vault','Dome',
];
