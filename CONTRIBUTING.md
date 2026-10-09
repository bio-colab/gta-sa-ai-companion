# Contributing to GTA San Andreas AI Companion (CONTRIBUTING.md)

Welcome! We are building a new paradigm for Embodied AI by turning legacy, deterministic video games into living simulation sandboxes. Whether you are an AI researcher, game developer, Python engineer, or GTA modder, your skills are needed!

---

## 🌟 How You Can Help

You don't need to know everything about GTA modding to contribute. Here are areas where contributions are immediately impactful:

1. **Adding New Actions & Animations**:
   - Expanding the `MODE_ACTIONS` catalog in `AINPC/llm_brain.py` and wiring them to CLEO Redux opcodes in `cleo/stage1_test[fs].js`.
2. **Audio & Voice Synthesis (TTS)**:
   - Implementing lightweight text-to-speech engines (Piper, ElevenLabs, edge-tts).
3. **Local LLM Providers**:
   - Adding native endpoints for Ollama, llama.cpp, and vLLM.
4. **Computer Vision & VLM**:
   - Integrating screen capture for multimodal visual perception.
5. **Prompt Engineering & Personas**:
   - Refining character archetypes, street slang, and dialect accuracy.
6. **Bug Fixing & Engine Stability**:
   - Identifying opcodes that may crash older PC builds or different game distributions.

---

## 🛠️ Development Setup

1. **Clone or Fork the Repository**:
   Clone the repository directly, or fork it to your GitHub account:
   ```bash
   git clone https://github.com/bio-colab/gta-sa-ai-companion.git
   cd gta-sa-ai-companion
   ```

2. **Set up Virtual Environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example AINPC/.env
   # Add your Groq API Key to AINPC/.env
   ```

4. **Verify JavaScript Syntax**:
   Ensure you have [Node.js](https://nodejs.org/) installed to validate CLEO Redux scripts:
   ```bash
   node --check "cleo/stage1_test[fs].js"
   ```

---

## 🧩 How to Add a New Companion Action

Adding a new action requires two simple steps:

### Step 1: Add the Opcode Handler in JavaScript (`cleo/stage1_test[fs].js`)
Locate the action execution loop in `stage1_test[fs].js` and add your action command:

```javascript
} else if (actionCmd === "salute") {
    // Example: Play military salute animation
    Task.PlayAnim(activePed, "SALUTE", "PED", 4.0, false, false, false, false, -1);
    Text.PrintStringNow("~g~[AI ACTION] Companion salutes!~w~", 2500);
}
```

### Step 2: Register the Action in the Mode Matrix (`AINPC/llm_brain.py`)
Add your action string to the appropriate mode in `MODE_ACTIONS`:

```python
MODE_ACTIONS = {
    "companion": [
        "follow_player", "look_at_player", "salute", ...
    ]
}
```

---

## 📋 Pull Request (PR) Guidelines

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/my-cool-action
   ```
2. **Verify Stability Before Committing**:
   - Ensure `node --check "cleo/stage1_test[fs].js"` reports **zero syntax errors**.
   - Ensure all Python files compile cleanly with `python -m py_compile AINPC/*.py`.
   - Never commit sensitive files (`.env`, `memory.db`, or any game binaries).
3. **Commit Messages**:
   - Write clear, concise commit messages (e.g., `feat: add military salute animation to companion mode`).
4. **Submit PR**:
   - Push to your fork and submit a Pull Request against the `main` branch of [bio-colab/gta-sa-ai-companion](https://github.com/bio-colab/gta-sa-ai-companion).

---

## 🤝 Community & Support

* Have an idea or question? Open an issue on GitHub!
* Join the discussion, test new builds, and let's bring San Andreas to life together.
