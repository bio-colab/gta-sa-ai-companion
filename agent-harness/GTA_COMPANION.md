# GTA San Andreas AI Companion: Agent Harness Architecture

## Overview
`cli-anything-gta` is an agent-native CLI harness for the GTA San Andreas AI Companion mod. It enables AI coding agents and automated pipelines to control, inspect, and interact with GTA San Andreas and its autonomous companion system directly through deterministic JSON-contract CLI commands and an interactive REPL skin.

## Architecture

```
                  ┌─────────────────────────────┐
                  │    AI Agent / Terminal      │
                  └──────────────┬──────────────┘
                                 │
                   cli-anything-gta [--json]
                                 │
                  ┌──────────────▼──────────────┐
                  │  Click CLI & ReplSkin REPL  │
                  └──────────────┬──────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
     ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
     │  telemetry  │      │  companion  │      │   memory    │
     │   module    │      │   module    │      │   module    │
     └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 │
                    ┌────────────▼───────────┐
                    │       gta_backend      │
                    └────────────┬───────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              ▼                                     ▼
     ┌──────────────────┐                  ┌──────────────────┐
     │ ainpc_bridge.ini │                  │   gta_sa.exe     │
     │  (IPC Channel)   │                  │ (Native Process) │
     └──────────────────┘                  └──────────────────┘
```

## State & Data Model
- **Game State (`[GAME]` in `cleo/ainpc_bridge.ini`):** Read-only telemetry updated live by CLEO Redux script:
  - `status`: Game connection state (`online` / `offline`)
  - `npc_active`: Companion recruitment state (0 or 1)
  - `cj_health`, `cj_armor`, `cj_wanted`, `cj_weapon`, `cj_in_car`, `threat_active`
- **Control State (`[BRIDGE]` in `cleo/ainpc_bridge.ini`):** Transactional command queue:
  - `action_cmd`: Dispatched action (`persona_<name>`, `give_weapon_<id>`, `heal`, `cover`, etc.)
  - `say_text`: Subtitle speech prompt
  - `active_mode`, `active_persona`, `trust_level`, `bravery`
- **Session State (`session.json`):** Local CLI session tracking recent commands, audit history, and active target.

## Command Groups & Subsystems

1. **`status` / `info`**: Non-destructive probe of game process, connection state, and active companion entity.
2. **`telemetry`**: Instant inspection of live player stats, vehicle status, crime level, and environmental context (clock, zone, weather).
3. **`companion`**: Full companion lifecycle & tactical management:
   - `persona <hitman|driver|heavy|medic|girlfriend>`: Behavioral profile switching.
   - `order <follow|stay|cover|attack|heal|dismiss>`: Tactical order dispatch.
   - `equip <m4|ak47|sniper|deagle|shotgun|smg|rpg>`: Direct weapon & ammo provisioning.
   - `speak <phrase>`: Authentic 3D in-engine voice playback with lip-sync.
   - `dismiss`: Safe group disengagement.
4. **`memory`**: Memory inspection and cross-version signature resolution:
   - `signatures`: Catalogs verified AOB signatures and hardware object pools (`CPedPool`, `CVehiclePool`, `CWorld::Players`).
   - `resolve [--exe PATH] [--no-ini]`: **Automated 16-D Semantic Behavioral Memory Resolver**. Scans any GTA SA executable (Steam, v1.01, modded), vectorizes candidate functions into 16-dimensional behavioral embeddings, and writes verified offsets (`ped_say`, `task_cover`, `los_raycast`, `ped_pool`, `veh_pool`, `world_players`) directly into `cleo/ainpc_bridge.ini`.
5. **`config`**: Reading and updating bridge settings, target executable path, and active persona traits.
6. **`repl`**: Interactive terminal shell with auto-completion, contextual command help, and session persistence.

## Deterministic JSON Contract Example

Every CLI command supports `--json` for zero-parsing-ambiguity external automation:

```bash
cli-anything-gta memory resolve --json
```

```json
{
  "status": "success",
  "executable": "D:\\GTA san andreas\\gta_sa.exe",
  "executable_size": 14383616,
  "machine": "x86 (32-bit)",
  "sha256": "590b4be1bb005f4e07edf6b32df4a95b7ba403fb85472d68aa4275875b345b6f",
  "version_detected": "v1.0 US (Original / HOODLUM)",
  "resolved_addresses": {
    "ped_say": "0x005EFFE0",
    "task_cover": "0x00654200",
    "los_raycast": "0x0056A490",
    "ped_pool": "0x00B74490",
    "veh_pool": "0x00B74494",
    "world_players": "0x00B7CD98"
  },
  "confidence_scores": {
    "ped_say": 0.9999,
    "task_cover": 1.0,
    "los_raycast": 1.0,
    "ped_pool": 1.0,
    "veh_pool": 1.0,
    "world_players": 1.0
  },
  "semantic_matching_engine": "REA-Neural (16-D Continuous Behavioral Vectors)",
  "ini_updated": true,
  "ini_file": "D:\\GTA san andreas\\cleo\\ainpc_bridge.ini"
}
```

## Developer & Low-Level Specifications Reference
* For RenderWare struct offsets, pool indexing math, and assembly signatures: **[Engine Internals (`docs/ENGINE_INTERNALS.md`)](../docs/ENGINE_INTERNALS.md)**
* For dual-tier failover, IPC packet structures, and opcode safety rules: **[System Architecture (`docs/ARCHITECTURE.md`)](../docs/ARCHITECTURE.md)**
