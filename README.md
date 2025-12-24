# Sonic Cosplay (Canvas) - VI TÍCH PHÂN Enemy (v3)

## Run
- VSCode -> install Live Server
- Right click `index.html` -> Open with Live Server

## Where to put sprites (AUTO-LOAD)
Player:
- `assets/player.png`
- `assets/player.sprite.json`

Enemy:
- `assets/enemies/vitichphan_monster.png`
- `assets/enemies/vitichphan_monster.sprite.json`

## Controls
- A/D or Left/Right: move
- Space: jump
- S/Down: roll (demo)
- R: reset
- F2: debug overlay (hitboxes + patrol range + death plane)

## Enemy logic
- Patrol between minX and maxX (in main.js)

## Background
- `assets/bg_hcmus_fire.png` auto-load as background.

## Obstacles (visual only, collision uses tilemap)
- Floating platforms use: `assets/obstacles/desk_platform.png` (recommended 256x64 transparent)
- Stairs use: `assets/obstacles/stairs_tile.png` (full diagonal stairs sprite, transparent bg).

## Campaign
- Levels: level1 -> level4 (boss). Auto-advance after win.
- Press R to reset current level.
