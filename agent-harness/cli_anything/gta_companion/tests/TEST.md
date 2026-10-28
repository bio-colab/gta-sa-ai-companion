# GTA San Andreas AI Companion CLI Test Documentation

## 1. Test Inventory Plan
- `test_core.py`: 12 Unit tests planned covering core logic in isolation without external dependencies.
- `test_full_e2e.py`: 10 E2E and Subprocess tests planned verifying real CLI commands, JSON contracts, and workflow chaining.

## 2. Unit Test Plan (`test_core.py`)
- **`session.py`:**
  - Test session serialization, action recording, history bounds, and undo stack.
  - Test edge cases: non-existent file, corrupted JSON recovery.
- **`telemetry.py`:**
  - Test weapon mapping from IDs (0 to 46).
  - Test structured telemetry schema dictionary generation.
- **`companion.py`:**
  - Test persona switching validation (valid vs invalid personas).
  - Test weapon command validation and speech event lookups.
- **`memory.py`:**
  - Test signature repository integrity and pattern layout.

## 3. E2E Test Plan (`test_full_e2e.py`)
- **Subprocess CLI Tests (`TestCLISubprocess`):**
  - Verify `cli-anything-gta --help` exits 0 with expected command list.
  - Verify `cli-anything-gta status --json` returns valid JSON with `harness_version`.
  - Verify `cli-anything-gta telemetry --json` returns structured player and companion state.
  - Verify `cli-anything-gta companion persona hitman --json` executes and returns success.
  - Verify `cli-anything-gta companion order cover --json` queues tactical cover command.
  - Verify `cli-anything-gta companion equip m4 --json` dispatches weapon equipment.
  - Verify `cli-anything-gta memory --json` exposes REA signatures catalog.
  - Verify `cli-anything-gta config show --json` and `config set --json`.

## 4. Realistic Workflow Scenarios
1. **Agent Combat Readiness Sequence:**
   - Inspect status -> probe telemetry -> switch persona to `hitman` -> equip `m4` -> issue `cover` order.
   - Verify every step outputs machine-readable JSON with `success: true`.


---

## 5. Test Execution Results (Part 2)

```text
============================= test session starts =============================
platform win32 -- Python 3.12.0, pytest-8.4.2, pluggy-1.6.0
rootdir: d:\GTA san andreas\agent-harness
collected 21 items

agent-harness\cli_anything\gta_companion\tests\test_core.py::TestSession::test_session_init_and_record PASSED [  4%]
agent-harness\cli_anything\gta_companion\tests\test_core.py::TestSession::test_session_save_and_load PASSED [  9%]
agent-harness\cli_anything\gta_companion\tests\test_core.py::TestTelemetry::test_weapons_mapping PASSED [ 14%]
agent-harness\cli_anything\gta_companion\tests\test_core.py::TestTelemetry::test_get_live_telemetry_structure PASSED [ 19%]
agent-harness\cli_anything\gta_companion\tests\test_core.py::TestCompanionLogic::test_persona_validation PASSED [ 23%]
agent-harness\cli_anything\gta_companion\tests\test_core.py::TestCompanionLogic::test_order_dispatch PASSED [ 28%]
agent-harness\cli_anything\gta_companion\tests\test_core.py::TestCompanionLogic::test_equip_weapon PASSED [ 33%]
agent-harness\cli_anything\gta_companion\tests\test_core.py::TestCompanionLogic::test_speech_events PASSED [ 38%]
agent-harness\cli_anything\gta_companion\tests\test_core.py::TestCompanionLogic::test_dismiss PASSED [ 42%]
agent-harness\cli_anything\gta_companion\tests\test_core.py::TestMemoryModule::test_signatures_info PASSED [ 47%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestCLISubprocess::test_help PASSED [ 52%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestCLISubprocess::test_status_json PASSED [ 57%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestCLISubprocess::test_telemetry_json PASSED [ 61%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestCLISubprocess::test_companion_persona_json PASSED [ 66%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestCLISubprocess::test_companion_order_json PASSED [ 71%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestCLISubprocess::test_companion_equip_json PASSED [ 76%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestCLISubprocess::test_companion_speak_json PASSED [ 80%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestCLISubprocess::test_companion_dismiss_json PASSED [ 85%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestMemoryModule::test_signatures_info PASSED [ 90%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestCLISubprocess::test_config_show_json PASSED [ 95%]
agent-harness\cli_anything\gta_companion\tests\test_full_e2e.py::TestCLISubprocess::test_workflow_combat_ready PASSED [100%]

============================= 21 passed in 4.08s ==============================
```

## 6. Summary Statistics
- **Total Tests:** 21
- **Passed:** 21
- **Failed:** 0
- **Pass Rate:** 100.0%
- **Execution Time:** ~4.08s

## 7. Coverage Notes
- Unit tests verify core data representations (Session, Telemetry, Companion, Memory).
- E2E tests verify the real installed `cli-anything-gta` command line executable in PATH without mocks.
