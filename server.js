'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { getSystemPrompt, OUTPUT_SCHEMA } = require('./src/prompt');

const PORT = process.env.PORT || 3000;
// Default per Anthropic guidance; override with MODEL=claude-haiku-4-5 (or
// claude-sonnet-5) for cheaper / faster generation.
const MODEL = process.env.MODEL || 'claude-opus-5';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.'
  );
  process.exit(1);
}

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/generate', async (req, res) => {
  const profile = (req.body && req.body.profile ? String(req.body.profile) : '').trim();
  if (!profile) {
    return res.status(400).json({ error: 'Paste a LinkedIn profile first.' });
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: {
        effort: 'low', // fast, no lengthy deliberation
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      system: [
        {
          type: 'text',
          text: getSystemPrompt(),
          cache_control: { type: 'ephemeral' }, // static prompt — cache it
        },
      ],
      messages: [
        {
          role: 'user',
          content:
            'Here is a pasted LinkedIn profile. Analyze it and return the two ' +
            'message options.\n\n---\n' + profile,
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return res
        .status(422)
        .json({ error: 'The request was declined. Try a different profile.' });
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) {
      return res.status(502).json({ error: 'No message returned. Try again.' });
    }

    const data = JSON.parse(textBlock.text);
    const options = Array.isArray(data.options) ? data.options.slice(0, 2) : [];
    if (options.length < 1) {
      return res.status(502).json({ error: 'No options generated. Try again.' });
    }

    return res.json({
      options,
      career_stage: data.career_stage || '',
      signal: data.signal || '',
    });
  } catch (err) {
    console.error('generate error:', err && err.message ? err.message : err);
    const status = err && err.status ? err.status : 500;
    return res
      .status(status >= 400 && status < 600 ? status : 500)
      .json({ error: 'Generation failed. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`LinkedIn copywriter running on http://localhost:${PORT} (model: ${MODEL})`);
});
