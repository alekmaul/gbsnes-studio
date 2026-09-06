import gb from "./gb";
import snes from "./snes";

const targets = { gb, snes };

/**
 * Resolve a compile-target descriptor by id.
 * Unknown / missing ids fall back to Game Boy so existing behaviour is
 * unchanged wherever a target has not been threaded through yet.
 */
export const getTarget = (id = "gb") => targets[id] || targets.gb;

export const TARGET_IDS = Object.keys(targets);

export { gb, snes };
export default targets;
