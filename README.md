# LinkedIn Outreach Copywriter

A standalone web app for an SDR at **Mercury** (a banking platform for startups)
that turns a pasted LinkedIn profile into **2 first-touch message options** —
designed to spark curiosity and start a conversation, never to pitch.

- Paste a founder's profile → get two personalized options in a couple seconds.
- No selling. Never mentions Mercury, banking, or anything sales-adjacent.
- Tone auto-calibrates to career stage (casual/Gen Z for younger founders,
  sharper and more polished for senior ones).
- Every message ends with a variation of *"curious, how's the build going with
  [company]?"*
- Trained on `reference/first_messages.csv` — ~60 real messages actually sent —
  which is the ground truth for tone, structure, and judgment.

## How it works

```
Browser (public/)  →  Express server (server.js)  →  Claude API
   paste profile        holds the API key,             claude-opus-5
   get 2 options        builds the prompt +            (structured output,
                        training data, calls Claude    low effort, prompt cache)
```

The Anthropic API key lives **only on the server** — it is never sent to the
browser. The server calls Claude with a cached system prompt (the copywriter
rules + the training CSV) and returns exactly two options as structured JSON.

## Running it locally

Requires Node.js 18+.

```bash
npm install
cp .env.example .env      # then paste your ANTHROPIC_API_KEY into .env
npm start                 # serves http://localhost:3000
```

Open http://localhost:3000, paste a LinkedIn profile (bio, headline, recent
posts, company info — anything visible), and click **Generate 2 options**
(⌘/Ctrl+Enter also works).

### Configuration (`.env`)

| Variable | Default | Notes |
|----------|---------|-------|
| `ANTHROPIC_API_KEY` | — | **Required.** Get one at https://console.anthropic.com |
| `MODEL` | `claude-opus-5` | Set to `claude-haiku-4-5` or `claude-sonnet-5` for faster / cheaper generation. |
| `PORT` | `3000` | Server port. |

## Deploying

It's a standard Node web service — deploy to any host that runs Node (Render,
Railway, Fly.io, a container, etc.):

1. Push this repo to the host.
2. Set `ANTHROPIC_API_KEY` (and optionally `MODEL`) as environment variables /
   secrets — do **not** commit `.env`.
3. Build/start command: `npm install` then `npm start`. The app listens on
   `$PORT`.

## Project layout

| Path | What it is |
|------|-----------|
| `server.js` | Express server: serves the page and the `/api/generate` endpoint. |
| `src/prompt.js` | Builds the system prompt (copywriter rules + training data) and the output schema. |
| `public/` | The web page (`index.html`, `styles.css`, `app.js`). |
| `reference/first_messages.csv` | The training data — real sent messages. Ground truth for voice. |

## Tuning the voice

The single most effective way to improve output is to keep
`reference/first_messages.csv` current: add the real messages that landed
replies. The app reads that file at startup and treats it as the source of
truth for phrasing, rhythm, and what to mention vs. skip. (Restart the server
after editing it.)

## Also included: Claude Code skill + subagent

If you (or teammates) use Claude Code, the same copywriter is also packaged as a
**skill** (`.claude/skills/linkedin-copywriter/`) and a **subagent**
(`.claude/agents/linkedin-copywriter.md`), both driven by the same rules and the
same training CSV. Open this repo in Claude Code and run
`/linkedin-copywriter`, or ask it to use the `linkedin-copywriter` agent, then
paste a profile. These are optional — the web app above is the primary
deliverable and needs no Claude Code.
