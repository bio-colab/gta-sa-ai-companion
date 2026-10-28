"""Main CLI Entry Point & REPL Interface for GTA San Andreas AI Companion."""

import sys
import json
import click
from pathlib import Path
from typing import Optional

from cli_anything.gta_companion.core.session import Session
from cli_anything.gta_companion.core.telemetry import get_live_telemetry
from cli_anything.gta_companion.core.companion import (
    switch_persona,
    issue_order,
    equip_weapon,
    trigger_speech,
    dismiss_companion,
    VALID_PERSONAS,
    WEAPON_COMMANDS,
    SPEECH_EVENTS,
)
from cli_anything.gta_companion.core.memory import get_memory_signatures_info
from cli_anything.gta_companion.utils.gta_backend import (
    find_gta_root,
    is_game_running,
    read_ini_safely,
    write_bridge_section,
)
from cli_anything.gta_companion.utils.repl_skin import ReplSkin


session = Session()


def handle_output(data: dict, use_json: bool, title: Optional[str] = None):
    """Output either deterministic JSON or styled human-readable text."""
    if use_json:
        click.echo(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        if title:
            click.secho(f"\n=== {title} ===", fg="cyan", bold=True)
        for k, v in data.items():
            if isinstance(v, dict):
                click.secho(f"  [{k}]", fg="yellow", bold=True)
                for sub_k, sub_v in v.items():
                    click.echo(f"    • {sub_k:<18}: {sub_v}")
            else:
                click.echo(f"  • {k:<20}: {v}")


@click.group(invoke_without_command=True)
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cli(ctx: click.Context, use_json: bool):
    """GTA San Andreas AI Companion: Agent-Native CLI Harness."""
    ctx.ensure_object(dict)
    ctx.obj["json"] = use_json

    if ctx.invoked_subcommand is None:
        ctx.invoke(cmd_repl)


@cli.command("status")
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cmd_status(ctx: click.Context, use_json: bool):
    """Inspect overall system status, game engine connection, and companion state."""
    is_json = use_json or ctx.obj.get("json", False)
    telem = get_live_telemetry()
    root = str(find_gta_root())
    
    data = {
        "harness_version": "1.0.0",
        "gta_root": root,
        "game_process_running": telem["game_process_running"],
        "bridge_status": telem["bridge_status"],
        "companion": telem["companion"],
        "player": telem["player"],
    }
    handle_output(data, is_json, title="GTA SA AI Companion Status")


@cli.command("telemetry")
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cmd_telemetry(ctx: click.Context, use_json: bool):
    """Fetch live player and environment telemetry from the active game session."""
    is_json = use_json or ctx.obj.get("json", False)
    telem = get_live_telemetry()
    handle_output(telem, is_json, title="Live Game Telemetry")


@cli.group("companion")
def grp_companion():
    """Manage companion lifecycle, personas, tactical orders, and equipment."""
    pass


@grp_companion.command("persona")
@click.argument("name", type=click.Choice(VALID_PERSONAS, case_sensitive=False))
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cmd_companion_persona(ctx: click.Context, name: str, use_json: bool):
    """Switch active companion persona (hitman, driver, heavy, medic, girlfriend, companion)."""
    is_json = use_json or ctx.obj.get("json", False)
    res = switch_persona(name)
    session.record_action("switch_persona", res)
    handle_output(res, is_json, title="Companion Persona Switched")


@grp_companion.command("order")
@click.argument("action", type=click.Choice(["follow", "attack", "cover", "heal", "drive", "distract", "regroup"], case_sensitive=False))
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cmd_companion_order(ctx: click.Context, action: str, use_json: bool):
    """Dispatch an on-foot or vehicle tactical order to the companion."""
    is_json = use_json or ctx.obj.get("json", False)
    res = issue_order(action)
    session.record_action("issue_order", res)
    handle_output(res, is_json, title="Tactical Order Dispatched")


@grp_companion.command("equip")
@click.argument("weapon", type=click.Choice(list(WEAPON_COMMANDS.keys()), case_sensitive=False))
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cmd_companion_equip(ctx: click.Context, weapon: str, use_json: bool):
    """Equip tactical weaponry (m4, deagle, shotgun, smg, rpg)."""
    is_json = use_json or ctx.obj.get("json", False)
    res = equip_weapon(weapon)
    session.record_action("equip_weapon", res)
    handle_output(res, is_json, title="Weapon Equipment")


@grp_companion.command("speak")
@click.argument("event", type=click.Choice(list(SPEECH_EVENTS.keys()), case_sensitive=False))
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cmd_companion_speak(ctx: click.Context, event: str, use_json: bool):
    """Trigger an authentic in-engine 3D voice line with facial lip-sync."""
    is_json = use_json or ctx.obj.get("json", False)
    res = trigger_speech(event)
    session.record_action("trigger_speech", res)
    handle_output(res, is_json, title="Voice Line Triggered")


@grp_companion.command("dismiss")
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cmd_companion_dismiss(ctx: click.Context, use_json: bool):
    """Safely dismiss the companion and release ped back to ambient AI."""
    is_json = use_json or ctx.obj.get("json", False)
    res = dismiss_companion()
    session.record_action("dismiss_companion", res)
    handle_output(res, is_json, title="Companion Dismissed")


@cli.command("memory")
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cmd_memory(ctx: click.Context, use_json: bool):
    """Inspect REA reverse engineered AOB signatures and memory structures."""
    is_json = use_json or ctx.obj.get("json", False)
    mem = get_memory_signatures_info()
    handle_output(mem, is_json, title="REA Memory Signatures & Offsets")


@cli.group("config")
def grp_config():
    """Inspect and update bridge settings and trust traits."""
    pass


@grp_config.command("show")
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cmd_config_show(ctx: click.Context, use_json: bool):
    """Show current bridge configuration parameters."""
    is_json = use_json or ctx.obj.get("json", False)
    _, bridge = read_ini_safely()
    handle_output(bridge, is_json, title="Bridge Configuration")


@grp_config.command("set")
@click.option("--key", required=True, help="Configuration key to set.")
@click.option("--val", required=True, help="Value to assign.")
@click.option("--json", "use_json", is_flag=True, help="Output in machine-readable JSON format.")
@click.pass_context
def cmd_config_set(ctx: click.Context, key: str, val: str, use_json: bool):
    """Update a specific bridge setting."""
    is_json = use_json or ctx.obj.get("json", False)
    success = write_bridge_section({key: val})
    data = {"key": key, "val": val, "success": success}
    session.record_action("config_set", data)
    handle_output(data, is_json, title="Bridge Configuration Updated")


@cli.command("repl")
@click.pass_context
def cmd_repl(ctx: click.Context):
    """Start interactive REPL shell with unified ReplSkin styling."""
    skin = ReplSkin("gta_companion", version="1.0.0")
    skin.print_banner()

    session_mgr = Session()
    click.secho("\nType 'help' to view available commands, or 'exit' / 'quit' to leave.\n", fg="cyan")

    pt_session = None
    try:
        pt_session = skin.create_prompt_session()
    except Exception:
        pass

    while True:
        try:
            if pt_session:
                line = skin.get_input(pt_session, project_name="GTA-SA", modified=False)
            else:
                line = input("gta-companion> ")

            if not line or not line.strip():
                continue

            parts = line.strip().split()
            cmd = parts[0].lower()

            if cmd in ["exit", "quit", "q"]:
                skin.print_goodbye()
                break

            if cmd == "help":
                commands_dict = {
                    "status": "Check engine connection, game process, and companion status",
                    "telemetry": "Inspect live player health, wanted level, weapons, and car status",
                    "companion persona <name>": "Switch role: hitman, driver, heavy, medic, girlfriend, companion",
                    "companion order <order>": "Dispatch tactical order: follow, attack, cover, heal, drive, distract",
                    "companion equip <weapon>": "Equip weapons: m4, deagle, shotgun, smg, rpg",
                    "companion speak <event>": "Trigger authentic 3D native speech with lip-sync",
                    "companion dismiss": "Safely dismiss companion",
                    "memory": "Inspect REA AOB signatures and memory pools",
                    "config show": "Display bridge configuration",
                    "exit": "Quit the REPL interface",
                }
                skin.help(commands_dict)
                continue

            # Run through click CLI runner
            try:
                cli.main(args=parts, standalone_mode=False)
            except Exception as e:
                skin.error(f"Command error: {e}")

        except (KeyboardInterrupt, EOFError):
            skin.print_goodbye()
            break


def main():
    """Main CLI execution handler."""
    cli(obj={})


if __name__ == "__main__":
    main()
