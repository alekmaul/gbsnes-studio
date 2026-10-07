---
title: Projectiles
parent: Event Reference
grand_parent: Scripting Events
nav_order: 9
---

# Projectiles

Fired sprites, momentary melee hitboxes and a Platformer bounce impulse - all share one small,
real collision system.

**Launch Projectile** - fires a sprite in a fixed direction from the active actor, with real
collision against other actors (and the player).

**Weapon: Attack** - a momentary hitbox in the active actor's current facing direction, for a
melee-style attack.

**Player: Bounce** - gives the player a fixed upward velocity impulse; only meaningful on
Platformer scenes.
