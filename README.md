# Terminator

Terminator is a CLI that converts natural language into shell commands or
scripts. It shows the generated script and an explanation, then asks you to
**Run / Revise / Cancel** before execution.

## Install

### Prerequisites

- Node.js (v18+)

### Installation

```bash
# Clone the repository
git clone https://github.com/oodadoudou/Terminator.git
cd Terminator

# Install dependencies and build
npm install
npm run build

# Link the executable globally
npm install -g .
```

## Usage

```bash
terminator "list all file in the current directory"
terminator -s "whoami"
terminator chat
```

## Docker

Build only:

```bash
docker build -t terminator:dev .
```

Build + run (demo):

```bash
docker build -t terminator:dev . && \
docker run --rm -it \
  -v "$HOME/.terminator:/root/.terminator" \
  terminator:dev --version
```

Build + run (prompt):

```bash
docker build -t terminator:dev . && \
docker run --rm -it \
  -v "$HOME/.terminator:/root/.terminator" \
  terminator:dev -s "whoami"
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
