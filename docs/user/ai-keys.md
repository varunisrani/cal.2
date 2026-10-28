# AI keys and providers

Platewise does not run an AI service. It sends requests straight from your browser to an AI
provider you choose, with a key from your own account at that provider. The provider bills you
for what you use, under its own prices and terms. Platewise is not part of that bill.

## What needs AI, and what does not

Uses your AI provider:

- analysing meal photos, typed meals ("Describe") and nutrition labels ("Scan label");
- adding an ingredient by photo or words in the review, and "Reprocess" on a logged entry;
- the suggestion in "Fit check";
- building your plan, rebuilding it, the weekly tune-up and nutrient goals;
- the Coach.

Works without AI:

- entering food by hand, reusing recent, frequent and saved foods, copying a day;
- barcode lookups (Open Food Facts, and FoodData Central if you add its free key);
- water, fasting, weigh-ins, Progress, backups and exports.

Without a key, the plan comes from standard formulas.

## Choose a provider

Platewise offers 16 choices. The main provider must be able to read photos, so two text-only
providers (DeepSeek and Cerebras) can only answer text requests or stand by for them.

| Provider      | Reads photos       | Where to make a key                                                                              |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| Gemini        | yes                | Google AI Studio: <https://aistudio.google.com/apikey>                                           |
| OpenAI        | yes                | the OpenAI platform: <https://platform.openai.com/api-keys>                                      |
| Anthropic     | yes                | the Claude Console: <https://console.anthropic.com/settings/keys>                                |
| xAI           | yes                | the xAI Console: <https://console.x.ai>                                                          |
| OpenRouter    | yes                | your OpenRouter settings: <https://openrouter.ai/settings/keys>                                  |
| Together AI   | yes                | your Together AI settings: <https://api.together.ai/settings/api-keys>                           |
| Groq          | yes                | the GroqCloud console: <https://console.groq.com/keys>                                           |
| Hugging Face  | yes                | your Hugging Face access tokens: <https://huggingface.co/settings/tokens>                        |
| Fireworks AI  | yes                | your Fireworks AI account: <https://fireworks.ai/account/api-keys>                               |
| DeepInfra     | yes                | the DeepInfra dashboard: <https://deepinfra.com/dash/api_keys>                                   |
| Mistral AI    | yes                | the Mistral AI console: <https://console.mistral.ai/api-keys>                                    |
| DeepSeek      | no (text only)     | the DeepSeek platform: <https://platform.deepseek.com/api_keys>                                  |
| Qwen          | yes                | Alibaba Cloud Model Studio, international region: <https://modelstudio.console.alibabacloud.com> |
| Cerebras      | no (text only)     | Cerebras Cloud: <https://cloud.cerebras.ai>                                                      |
| Ollama        | with a photo model | no key: a model server you run yourself (see [Ollama](#ollama-on-your-own-computer))             |
| Custom server | with a photo model | any server that speaks the OpenAI-style chat format; a key only if your server asks for one      |

Platewise links the same pages next to the key field ("Get a key from …"). Vendors move these
pages from time to time; if a link has moved, look for "API keys" in the vendor's console.

Each provider comes with a short list of models, quick and low-cost ones first. OpenRouter,
Hugging Face, Ollama and Custom server also take any model id: choose "Another model…" and type it
exactly as the provider writes it. For a Custom server you always type the model.

## Set it up

You can connect a provider during setup ("Connect your AI"), or later in **Settings › AI
providers**.

1. Pick the provider. The model list changes to match.
2. Pick a model, or keep the first one.
3. Paste your key. For Ollama and Custom server, enter the server address instead (and a key, for a
   Custom server that needs one).

Changes on the AI providers page are saved as soon as nothing required is missing.

Your key is kept in this browser on this device and is sent only to the provider it belongs to.
Once saved, it shows as its first and last four characters (a short key shows as dots only). Use
"Forget the … key" to remove it. More on how keys are stored in
[Privacy and storage](privacy-and-storage.md#your-api-keys).

### The parts of the AI providers page

- **Main provider:** reads your meal photos, and answers everything else too unless you switch on a
  text model.
- **Text requests:** "Different model for text" sends typed meals, plans and the Coach to another
  model, for example a cheaper or faster one. Photos still go to the main provider.
- **Standby for photos** and **Standby for text:** a second provider or model, tried once when a
  request fails or its answer cannot be used. A standby must differ from what it backs up: the
  same model on the same server would never be tried, so Platewise asks you to pick another.
- **Requests:**
  - "Give up after" sets the time limit for the whole request, retries and the standby included:
    30 to 600 seconds, 180 by default.
  - "Answer length limit" is the most a model may write in one answer, 8 192 tokens by default.
    Models that think before answering (Claude 5, the GPT and Gemini thinking models) count their
    thinking toward it. Before 1.5.0 the default was 1 024, which those models often used up; a
    limit still at 1 024 is raised to 8 192 once when you update.
    Raise it if long meals come back cut off.
  - "OpenRouter reasoning effort" appears while OpenRouter serves any of the four roles above. More
    effort takes longer and costs more.
- **Notes for the AI:** a few lines sent with every request, such as where you live or how you
  usually cook. Leave it empty to send nothing.
- **Food databases:** the optional FoodData Central key for barcode lookups. It is free from the
  USDA ("Get a free key from the USDA").

## What it costs

Platewise itself is free and adds nothing to your provider's bill. What you pay depends on your
provider, your model and how much you use it. Some providers have free plans with daily limits;
others charge per request size from the first request. Check the provider's price page.

What makes a difference:

- **Photos cost more than words.** Each photo is sent as a fresh JPEG of at most 1 600 pixels on
  its longest side. A meal can have up to 10 photos, and each one adds to the request.
- **The Coach costs more than a meal.** One question can take up to six requests while the Coach
  looks things up in your diary, and each request carries the recent chat and the data found so
  far.
- **Background requests are few.** The weekly tune-up asks once a week, when you open Platewise
  (only while it is on). A plan rebuild sends a second, small request for nutrient goals.
- **Some requests repeat.** When a provider answers that it is busy or that too many requests
  came in, Platewise waits 1, 2 and then 4 seconds and tries again, at most three more times. An
  answer cut off at the length limit is asked for once more in a shorter form. A standby, if set,
  runs once after a failure. A food with a known weight but no calories at all, such as water or
  black coffee, may get one short extra request for its serving units.

Ways to keep costs low:

- Set a spending limit or a budget alert in your provider account, where it offers one.
- Start with the first model in the list; move up only if the numbers are not good enough.
- Use "Different model for text" to send text requests to a cheaper model.
- Keep the answer length limit at its default unless answers come back cut off.
- On OpenRouter, keep the reasoning effort low or at the model's default.

## Ollama on your own computer

Ollama runs open models on your own computer, so nothing goes to a cloud provider and there is no
key. Platewise accepts a plain `http://` address only when it points at the device you are using:
`localhost` or `127.0.0.1` (not `[::1]`, which the browser does not let Platewise reach). Any other
address must start with `https://`. Over plain http your requests would travel unencrypted, and an
https page cannot reach plain-http addresses on your network anyway. So run Ollama **on the same device** as your browser, or **behind https**.

Both ways need two things:

- **A model that reads photos** for the main provider, for example `gemma4`, `qwen3.5` or
  `ministral-3` from the list (`ollama pull gemma4`). Text-only models can still serve "Text
  requests".
- **Permission for Platewise's address.** Start Ollama with the environment variable
  `OLLAMA_ORIGINS` set to the address you open Platewise at, scheme and host only (for example
  `https://your-platewise-address`). Without it, Ollama refuses requests from the page. Ollama's
  own documentation explains how to set it on your system.

### Same device

Use this on a laptop or desktop where both the browser and Ollama run.

1. Install Ollama, pull a photo model, and start it with `OLLAMA_ORIGINS` set.
2. In Platewise, choose **Ollama**. Keep the server address `http://localhost:11434/v1`.
3. Pick the model you pulled, or choose "Another model…" and type its tag (such as
   `qwen3.5:9b`).

Your browser may ask whether this site may reach devices on your local network. Allow it. If your
browser blocks the page from reaching `http://localhost` at all, use the https setup below, on the
same computer.

### Another computer, behind https

Use this from a phone or tablet. On a phone, `localhost` means the phone itself, not your computer.

1. Run Ollama on a computer that stays on, with a photo model and `OLLAMA_ORIGINS` set.
2. Give it an https address with a certificate your phone trusts: a reverse proxy with a domain
   name in front of `http://localhost:11434`, or a tunnel service that gives you an https address.
3. In Platewise, choose **Ollama** and enter that address with `/v1` at the end, for example
   `https://ollama.your-domain/v1`. Platewise reminds you when `/v1` is missing.

Anyone who can reach that address can use your Ollama, because Ollama itself takes no key. Limit
who can reach it. If your proxy asks for a key, choose **Custom server** instead of Ollama: it
sends the key you enter as a bearer token.

### Tips for your own server

- Local models can be slow, especially the first request while the model loads. Raise "Give up
  after" if requests time out. For your own servers one attempt may use the whole time limit.
- You can use two Ollama servers, or one server with two models, as main provider and standby.
- **Custom server** works the same way for any server that speaks the OpenAI-style chat format,
  such as other local runners or a relay you host. Its address usually ends in `/v1`, and it must
  accept requests from Platewise's address.

## When something goes wrong

Platewise shows a short message instead of the provider's own error text. The most common ones:

| Message says                                    | What to do                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Add an API key for this provider                | Paste a key in Settings › AI providers.                                                       |
| The provider refused the API key                | Copy the key again from the vendor's page. Check that it is active and for the right account. |
| This AI account has run out of credit           | Add credit with the provider, or choose another provider.                                     |
| Today's allowance … is used up                  | Free plans often have daily caps. Wait until tomorrow or switch provider.                     |
| Too many requests in a short time               | Wait a minute and try again.                                                                  |
| The AI service is busy right now                | Platewise already retried. Try later, or choose another model.                                |
| The AI didn't answer in time                    | Try again, or raise "Give up after".                                                          |
| The provider doesn't know this model or address | Check the model id and, for your own server, the address and its `/v1`.                       |
| Couldn't reach the AI service                   | Check your connection. For your own server: is it running, and is `OLLAMA_ORIGINS` set?       |
| The answer was cut off twice                    | Raise the answer length limit, send fewer photos, or try another model.                       |
| The request is too big for this provider        | Send fewer or smaller photos.                                                                 |

When a standby is set and both fail, the message names both and then gives the standby's reason.
