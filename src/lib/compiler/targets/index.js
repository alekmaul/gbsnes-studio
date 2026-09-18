import snes from "./snes";

// SNES is the only compile target this app builds for. This module used to
// be a { gb, snes } registry with a getTarget(id) lookup (falling back to
// "gb" for any unset/unknown id) from when both targets were supported side
// by side - collapsed to a single descriptor once the Game Boy target was
// removed, so there's no longer an implicit "which target?" question that
// code could silently get wrong.
export default snes;
export { snes };
