"""Memory Inspection & REA Reverse Engineered Signatures Module."""

from typing import Dict, Any

MEMORY_SIGNATURES = {
    "CPedPool & CVehiclePool": {
        "pattern": "A1 ?? ?? ?? ?? C3 90 90 90 90 90 90 90 90 90 90 A1 ?? ?? ?? ?? C3",
        "default_addresses": {"ped_pool": "0x00B74490", "veh_pool": "0x00B74494"},
        "purpose": "Hardware object pools for pedestrians and vehicles",
    },
    "CWorld::Players": {
        "pattern": "69 C0 90 01 00 00 8B 80 ?? ?? ?? ?? C3",
        "default_addresses": {"player_array": "0x00B7CD98"},
        "purpose": "Direct access to Player[0] entity struct and live stats",
    },
    "CPed::Say": {
        "pattern": "8B 44 24 04 66 85 C0 74 2A 8B 54 24 18 52",
        "default_addresses": {"ped_say_fn": "0x005EFFE0"},
        "purpose": "Native 3D audio speech playback with facial lip-sync",
    },
    "CTaskComplexSeekCoverUntilTargetDead": {
        "pattern": "0x00654200 (Constructor) / 0x86F308 (VTable)",
        "default_addresses": {"task_ctor": "0x00654200", "vtable": "0x0086F308"},
        "purpose": "Engine native tactical crouching and vehicle cover AI",
    },
}


def get_memory_signatures_info() -> Dict[str, Any]:
    """Return catalog of verified AOB signatures and hardware pointers."""
    return {
        "aob_scanner_supported": True,
        "target_executable": "gta_sa.exe",
        "signatures_count": len(MEMORY_SIGNATURES),
        "signatures": MEMORY_SIGNATURES,
        "universal_compatibility": ["v1.0 US", "v1.01 EU", "Steam", "SilentPatch"],
    }
