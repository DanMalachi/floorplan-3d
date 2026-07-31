// Configurable model constants (meters). Never inline these in geometry code.

export const WALL_HEIGHT = 2.4;
export const DEFAULT_THICKNESS = 0.1;
// A rail is a low see-through barrier (balcony railing, glass balustrade, low
// parapet) — waist-to-chest high, not a full wall.
export const RAIL_HEIGHT = 1.1;

export const DEFAULT_DOOR = { width: 0.9, height: 2.0, sill: 0 };
export const DEFAULT_WINDOW = { width: 1.2, height: 1.2, sill: 0.9 };

// --- Stairs ---------------------------------------------------------------
// A stair's default climb is a full storey (the common case when tracing a
// plan whose upper floor isn't modeled); the trace panel lowers it for
// terraces, split levels and sunken rooms.
export const DEFAULT_STAIR = { width: 0.9, rise: WALL_HEIGHT };
// Target riser height. The step count derives from `rise / COMFORT_RISER`, so
// this is what makes a traced stair come out climbable without being typed.
export const COMFORT_RISER = 0.175;
export const MIN_STAIR_STEPS = 2;
// The top landing stub, projected past the last tread — with no floor above to
// land on, this slab is what says "the floor above starts here".
export const LANDING_DEPTH = 0.9;
export const LANDING_SLAB = 0.15; // landing thickness; its TOP sits at its height
