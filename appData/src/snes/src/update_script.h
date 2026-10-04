#ifndef UPDATE_SCRIPT_H
#define UPDATE_SCRIPT_H

/*
 * On Update subsystem (v4) - a persistent, per-actor background script
 * (Actor.updateScript, the "On Update" tab ActorEditor.tsx already had).
 *
 * GB Studio 3.x's real engine (GBVM) runs this as a genuine concurrent
 * thread - up to 16 script contexts, round-robin scheduled every frame,
 * completely independent of whatever the foreground script is doing. This
 * engine has exactly one bytecode VM (script_runner.c's script_ptr and
 * friends), so a literal port isn't possible without rewriting the VM core
 * into a real multi-context scheduler (out of scope - same class of change
 * as adopting GBVM itself, which this fork's whole v4 roadmap deliberately
 * avoids).
 *
 * Scoped design instead: a small fixed pool of MAX_UPDATE_CONTEXTS saved VM
 * states (ptr/stack/actor/wait timer), each independent of the foreground's
 * own script_ptr - critically NOT the same global SceneHandleInput() checks
 * to decide whether the player can move/interact. UpdateScriptsProcess()
 * (called once per frame from SceneUpdate) gives every active context a
 * turn by swapping its saved state into the shared globals the opcode
 * dispatch table (script_cmds.c) already operates on, letting
 * ScriptRunnerUpdate() run its natural burst, then saving the (possibly
 * still mid-Wait) state back out - the foreground's own live state is
 * saved before the first swap and restored after the last, so none of this
 * is visible to, or blocked by, the foreground script. This is what makes
 * the idiomatic `Loop Forever { Wait N; ... }` authoring pattern safe to
 * use in an On Update script: unlike a naive "just run_script() it when the
 * foreground is idle" design, it can never occupy the global that gates
 * player input, so it can't freeze the player by looping forever.
 *
 * Real, documented limitations of this scoped version vs GB Studio 3.x:
 *  - Only MAX_UPDATE_CONTEXTS actors can have a running update script at
 *    once per scene - a scene needing more just doesn't run the extras'
 *    update scripts. v4 follow-up (user-asked: "can we update to 16?",
 *    after hitting the 4-ship cap in a 15-ship Shoot Em Up scene): raised
 *    4 -> 16 to match GB Studio 3.x's own real `VM_MAX_CONTEXTS` (GBVM,
 *    `vm.h`) exactly - 4 was this port's own original, deliberately modest
 *    choice (matching SPRITE_SLOTS/MAX_PROJECTILES/the 4 timer contexts
 *    elsewhere in this engine), not a hardware ceiling: each slot is a
 *    real but small WRAM cost (measured from a real compiled binary - the
 *    gap between the `update_ctxs` symbol and the next one in a `.sym`
 *    file - 84 bytes/slot), so 16 costs ~1.3 KB total vs 4's ~336 B, a
 *    trivial fraction of this engine's WRAM budget (PERF.md: ~14% used).
 *    GB Studio's own 16 is shared across *every* concurrent script of any
 *    kind (On Update, input scripts, timer scripts, ...), not an "On
 *    Update only" budget - this port's pool is the same way. The real
 *    risk of raising this isn't WRAM, it's CPU: each *active* context
 *    pays a real per-frame ScriptRunnerUpdate()+ActorMoveAim() cost on a
 *    compiler (816-tcc) PERF.md already documents as CPU-constrained: an
 *    inactive slot is cheap (one array read + branch to skip it), but a
 *    scene that actually populates many more *active* concurrent update
 *    scripts than before (not just raises the cap) should be re-profiled
 *    the same way PERF.md's own actor-count stress tests were.
 *  - An update script's own Wait/blocking opcodes only manage a per-context
 *    wait_time - opcodes that block via a *different* shared global
 *    (Camera Shake's shake_time, Await Input's await_input) aren't safe to
 *    author inside one: they'd read/write the foreground's own shared
 *    state, not a private copy. Not a realistic authoring pattern for a
 *    background ambient script, so not solved here.
 *  - Turns are round-robined one context at a time per frame in pool-slot
 *    order, not truly simultaneous - fine for the intended use (ambient/
 *    idle behaviour, simple per-actor AI), not a general-purpose thread.
 */
#include "gbs_types.h"

#define MAX_UPDATE_CONTEXTS 16
#define UPDATE_CTX_NONE 0xFF

/* SceneInit: clears the pool (a previous scene's saved pointers are
 * meaningless once the scene's own bytecode is gone). */
void UpdateScriptsReset(void);

/* SceneUpdate, once per frame: gives every active context its turn. */
void UpdateScriptsProcess(void);

/* Claims a free pool slot for `actor` and launches its compiled
 * Actor.updateScript from the top. No-op if the actor already owns a slot,
 * its compiled script is empty, or the pool is full. Called automatically
 * for every scene-resident actor at SceneInit (matches GB Studio 3.x's own
 * activate_actor()) and by ACTOR_START_UPDATE / re-activating a deactivated
 * actor. */
void ActorStartUpdate(u8 actor);

/* Frees `actor`'s pool slot, if it has one. No-op otherwise. Called by
 * ACTOR_STOP_UPDATE and by deactivating an actor. */
void ActorStopUpdate(u8 actor);

#endif
