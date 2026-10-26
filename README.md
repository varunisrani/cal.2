# Platewise

Snap, scan, type or describe what you ate, and let **your own AI key** do the counting.
Platewise is a local-first, privacy-first calorie and nutrition tracker that runs as an
installable web app on any phone or desktop browser:

- no account, no ads and no tracking;
- your diary stays on your device;
- AI requests go straight from your device to the provider you choose.

> Status: under construction. The build plan is in [`docs/plan/`](docs/plan/README.md) and the
> current state of the build is in [`docs/HANDOFF.md`](docs/HANDOFF.md).

## What it does (v1 target)

- **Log food** from photos (up to 10 at once, with an optional note), a typed description, a
  barcode (Open Food Facts) or manual entry. Review and correct every number before it is logged.
- **Bring your own AI**: Gemini, OpenAI, Anthropic Claude, OpenRouter, Groq, Mistral, DeepSeek,
  xAI, Together, Fireworks, DeepInfra, Hugging Face, Alibaba Qwen, Cerebras, a local Ollama, or any
  OpenAI-compatible endpoint, with a fallback provider and automatic retry on overload.
- **Goals that adapt**: BMR/TDEE from your profile, macro targets, optional nutrient goals, and a
  weekly adjustment from your real weight trend.
- **Track the day**: calorie ring, macro bars, 30+ nutrients, water and fasting, plus a week strip.
- **See progress**: weight and body-fat charts, calorie history, weekly recap and a weight forecast.
- **Ask the Coach**: chat that reads your own log to answer "how am I doing?".
- **Own your data**: export and import your diary, and back up to a file.

## Development

```bash
cd platewise
pnpm install --frozen-lockfile
pnpm dev            # http://localhost:5173
pnpm test           # unit tests
pnpm build && pnpm e2e
```

Contributors and agents: read [`AGENTS.md`](AGENTS.md) first.

## Credits

Platewise's design is inspired by [Fud AI](https://github.com/apoorvdarshan/fud-ai) (MIT). It is a
clean-room re-implementation, written from scratch; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## License

MIT.
