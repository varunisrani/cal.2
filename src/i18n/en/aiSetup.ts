import type { MessageTree } from '../catalogue';

/**
 * Words of AI setup (src/features/ai-setup): the provider form shared by the onboarding step and
 * the AI settings page (provider, model, server address, key), the onboarding AI access step
 * (P05-04), and Settings › AI providers (`page`, P09-07). Provider names are not here: they are
 * vendor names, kept in the provider catalogue.
 */
export const aiSetup = {
  aiSetup: {
    provider: {
      label: 'AI provider',
      cloud: 'Cloud services',
      ownServer: 'Your own server',
    },
    model: {
      label: 'Model',
      other: 'Another model…',
      idLabel: 'Model id',
      idHint: 'Type the id exactly as your provider writes it.',
      missing: 'Type a model id to go on.',
    },
    server: {
      label: 'Server address',
      ollamaHelp:
        "Ollama on this device, or on another machine behind https. Start it with OLLAMA_ORIGINS set to this site's address so the browser may reach it.",
      customHelp:
        'The address of an OpenAI-compatible server, usually ending in /v1. It must accept requests from this site.',
      addV1: "Ollama's API usually lives under /v1. Add it if requests fail.",
      missing: "Type your server's address to go on.",
      problem: {
        malformed: "That isn't a web address. Use one like https://example.com/v1, without ? or #.",
        credentials: 'Leave the user name and password out of the address.',
        scheme: 'Use an address that starts with https:// (http:// only for this device).',
        plainHttp:
          'Plain http only works for this device (localhost). For a server on another machine, use its https address: over http your key would travel unencrypted.',
        ipv6Loopback:
          'For this device, type localhost or 127.0.0.1 instead of [::1]: the browser does not let Platewise reach [::1].',
      },
    },
    key: {
      label: 'API key',
      labelOptional: 'API key (optional)',
      saved: 'Saved key: {mask}',
      replace: 'Paste a new key here to replace it.',
      optional: 'Only if your server asks for one.',
      missing: 'Paste your key to go on.',
      device: 'Your key stays in this browser on this device and is sent only to {provider}.',
      getAt: 'Get a key from {place}',
      places: {
        gemini: 'Google AI Studio',
        openai: 'the OpenAI platform',
        anthropic: 'the Claude Console',
        xai: 'the xAI Console',
        openrouter: 'your OpenRouter settings',
        together: 'your Together AI settings',
        groq: 'the GroqCloud console',
        huggingface: 'your Hugging Face access tokens',
        fireworks: 'your Fireworks AI account',
        deepinfra: 'the DeepInfra dashboard',
        mistral: 'the Mistral AI console',
        deepseek: 'the DeepSeek platform',
        qwen: 'Alibaba Cloud Model Studio',
        cerebras: 'Cerebras Cloud',
      },
    },
    access: {
      title: 'Connect your AI',
      subtitle: 'Platewise reads your meals with an AI service you pick, using your own key.',
      terms: {
        title: 'Before you go on',
        estimates:
          'AI numbers are estimates. Check them, and ask a professional for medical advice.',
        sharing:
          'What you send for analysis, such as photos and descriptions, goes to the provider you pick and falls under its terms.',
        local: 'Platewise has no server of its own: your diary and your key stay on this device.',
        accept: 'I accept these terms',
      },
      later: 'Set up later',
      laterNote:
        'Without AI, your plan comes from standard formulas. You can add a key in Settings at any time.',
      saveFailed: "Your AI choice didn't save. Please try again.",
    },
    page: {
      title: 'AI providers',
      storage:
        "Your keys are kept in this browser on this device. A browser can't fully shield them from code running on this site, so use keys with a spending limit where your provider offers one, and forget a key here once you no longer need it.",
      roles: {
        primary: {
          heading: 'Main provider',
          about:
            'Reads your meal photos, and answers everything else too unless a text model is switched on below.',
        },
        textRole: {
          heading: 'Text requests',
          switch: 'Different model for text',
          about:
            'Typed meals, plans and the Coach go to this model. Photos still go to the main provider.',
        },
        imageStandby: {
          heading: 'Standby for photos',
          switch: 'Back up photo requests',
          about: 'Tried once when a request with photos fails.',
        },
        textStandby: {
          heading: 'Standby for text',
          switch: 'Back up text requests',
          about: 'Tried once when a request without photos fails, whichever model served it.',
        },
      },
      pending: 'Changes here are saved once nothing above is missing.',
      same: 'This is the same model on the same server as the one it backs up, so it would never be tried. Pick another model or server.',
      saveFailed: "That change didn't save. Please try again.",
      forget: 'Forget the {provider} key',
      limits: {
        heading: 'Requests',
        timeout: {
          label: 'Give up after',
          unit: 'seconds',
          hint: 'From 30 to 600 seconds, for the whole request: retries and the standby included.',
        },
        maxTokens: {
          label: 'Answer length limit',
          unit: 'tokens',
          hint: 'The longest answer a model may send, thinking included, with every provider. Raise it if answers come back cut off.',
        },
        effort: {
          label: 'OpenRouter reasoning effort',
          help: 'Used for every OpenRouter request. Models support different levels, and more effort takes longer and costs more. An answer cut off at the length limit is asked for again at low effort.',
          options: {
            auto: "Model's default",
            none: 'None',
            minimal: 'Minimal',
            low: 'Low',
            medium: 'Medium',
            high: 'High',
            xhigh: 'Very high',
            max: 'Maximum',
          },
        },
      },
      notes: {
        heading: 'Notes for the AI',
        label: 'Your notes',
        hint: 'Sent with every request: where you live, how you eat, anything you would otherwise repeat. Leave it empty to send none.',
        save: 'Save notes',
        saved: 'Notes saved.',
        off: 'No notes are sent.',
      },
      foodDb: {
        heading: 'Food databases',
        about:
          "Barcodes are looked up in Open Food Facts first. With a free FoodData Central key from the USDA, products Open Food Facts doesn't know are looked up there too.",
        label: 'FoodData Central key',
        save: 'Save key',
        saved: 'Saved key: {mask}',
        forget: 'Forget key',
        signUp: 'Get a free key from the USDA',
        device:
          'Your key stays in this browser on this device and is sent only to FoodData Central.',
        unsafe:
          "That key holds a character a key can't have, such as a space. Copy it again from the USDA's email.",
      },
    },
  },
} as const satisfies MessageTree;
