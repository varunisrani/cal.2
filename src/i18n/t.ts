import { lookupMessage, type MessageAt, type MessageKey, type MessageTree } from './catalogue';
import { en } from './en';
import { numberFormat, pluralRules } from './format';
import { currentLocale } from './locale';
import { parseMessage, renderMessage, type MessageParams, type ParsedMessage } from './message';

export type { MessageParams } from './message';

/** The catalogue's language. Plural categories follow it; numbers follow the browser locale. */
const CATALOGUE_LANGUAGE = 'en';

/** Authoring mistakes throw in tests and dev builds; production degrades quietly instead. */
const STRICT_BY_DEFAULT = import.meta.env.MODE === 'test' || import.meta.env.DEV;

/** Params are required when the message text has a placeholder, optional otherwise. */
type ParamsArg<M> = M extends `${string}{${string}`
  ? [params: MessageParams]
  : [params?: MessageParams];

export type Translator<C extends MessageTree> = <K extends MessageKey<C>>(
  key: K,
  ...params: ParamsArg<MessageAt<C, K>>
) => string;

export interface TranslatorOptions {
  /** Throw on an unknown key, a missing param or a bad message (default: tests and dev). */
  readonly strict?: boolean;
  /** The locale numbers in messages follow (default: the browser locale). */
  readonly locale?: () => string;
}

/**
 * A `t()` over any catalogue. Unknown key: throws when strict, else returns the key. Missing
 * param: throws when strict, else leaves `{name}` in the text.
 */
export function createTranslator<C extends MessageTree>(
  catalogue: C,
  options: TranslatorOptions = {},
): Translator<C> {
  const strict = options.strict ?? STRICT_BY_DEFAULT;
  const locale = options.locale ?? currentLocale;
  const parsed = new Map<string, ParsedMessage>();

  const problem = (text: string, fallback: string): string => {
    if (strict) throw new Error(text);
    return fallback;
  };

  const messageFor = (key: string): ParsedMessage | undefined => {
    const known = parsed.get(key);
    if (known) return known;
    const source = lookupMessage(catalogue, key);
    if (source === undefined) return undefined;
    let message: ParsedMessage;
    try {
      message = parseMessage(source);
    } catch (error) {
      if (strict) throw new Error(`Message "${key}" does not parse`, { cause: error });
      message = [{ kind: 'text', text: source }];
    }
    parsed.set(key, message);
    return message;
  };

  const translate = (key: string, params?: MessageParams): string => {
    const message = messageFor(key);
    if (!message) return problem(`Unknown message key "${key}"`, key);
    return renderMessage(message, {
      params,
      plural: pluralRules(CATALOGUE_LANGUAGE),
      number: numberFormat(locale()),
      onProblem: (text, fallback) => problem(`${text} in message "${key}"`, fallback),
    });
  };
  return translate as Translator<C>;
}

/** Any key of the app's catalogue, for props and tables that carry a key instead of text. */
export type TKey = MessageKey<typeof en>;

/** The app's text: `t('common.save')`, `t('area.key', { name })`. */
export const t = createTranslator(en);
