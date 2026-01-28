# Terminator

Terminator is a CLI that converts natural language into shell commands or
scripts. It shows the generated script and an explanation, then asks you to
**Run / Revise / Cancel** before execution.

## Install

```bash
npm install -g terminator
```

## Usage

```bash
terminator "list all log files"
terminator -s "whoami"
terminator chat
```

## Config

```bash
terminator config
terminator config set OPENAI_KEY=YOUR_TOKEN
terminator config set OPENAI_API_ENDPOINT=https://llm.aiqu.ai
terminator config set MODEL=gpt-oss-120b
```

Config keys:

- `OPENAI_KEY`
- `OPENAI_API_ENDPOINT`
- `MODEL`
- `LANGUAGE`
- `SILENT_MODE`

Config is stored locally in `~/.terminator`.

## Defaults (Hackathon)

- `OPENAI_API_ENDPOINT = https://llm.aiqu.ai`
- `MODEL = gpt-oss-120b`

## Hackathon

This project is for the Chalmers AI Society x GoWest First-Ever Joint Hackathon and the Builderbase AIxia track.

Track link:

```
https://www.builderbase.com/v2/track/aixia-track-orchestrate-ai-aiqu
```

## Safety

Commands are executed only if **Run** is explicitly selected.
