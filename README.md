# LinkedIn Outreach Copywriter

A copywriter agent for an SDR at **Mercury** (a banking platform for startups)
that writes **first-touch LinkedIn messages to tech founders**. You paste a
LinkedIn profile; it returns **2 personalized message options** designed to
spark curiosity and start a conversation — never to pitch.

- No selling. Never mentions Mercury, banking, or anything sales-adjacent.
- Fast by design: picks the single best signal and writes — no long deliberation.
- Tone auto-calibrates to the prospect's career stage (casual/Gen Z for
  younger founders, sharper and more polished for senior ones).
- Every message ends with a variation of *"curious, how's the build going with
  [company]?"*

## How it's built

Two equivalent entry points, both driven by the same rules and the same
training data:

| File | What it is | How you use it |
|------|-----------|----------------|
| `.claude/skills/linkedin-copywriter/SKILL.md` | A Claude Code **skill** | In Claude Code, run `/linkedin-copywriter` (or just paste a profile and ask for outreach), then paste the LinkedIn profile. |
| `.claude/agents/linkedin-copywriter.md` | A Claude Code **subagent** (fast model) | Ask Claude to "use the linkedin-copywriter agent on this profile: …". Runs on a fast model for quick, cheap generation. |
| `reference/first_messages.csv` | **Training data** — ~60 real first messages actually sent | Ground truth for tone, structure, and judgment. Both entry points read from it. Add your best sent messages here to keep improving the voice. |

## Usage

Paste a LinkedIn profile — bio, recent posts, company info, any visible
details. The agent analyzes:

1. **Career stage / seniority** — to calibrate tone.
2. **The single best signal** — a recent post's framing, a launch, funding or
   an accelerator, a notable stat, a hiring spike, or a career transition.
3. **Stealth status** — if building in stealth, it uses any available hint; if
   there's genuinely nothing, it falls back to a casual stealth opener.

It then outputs **only** two message options:

```
Option 1:
hey [name], [specific hook + one sharp observation]. curious, how's the build going with [company]?

Option 2:
[a different hook / angle / register] ... curious, how's the build going?
```

## Tuning the voice

The single most effective way to improve output is to keep
`reference/first_messages.csv` current: paste in the real messages that landed
replies. The agent treats that file as ground truth for phrasing, rhythm, and
what to mention vs. skip.
