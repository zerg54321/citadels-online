/// <reference types="vite/client" />

declare module 'twemoji' {
  export interface TwemojiOptions {
    base?: string;
    folder?: string;
    ext?: string;
    callback?: (icon: string, options: { variant: string }, raw: string) => string | boolean;
    attributes?: () => Record<string, string>;
  }
  export function parse(
    input: string | HTMLElement,
    options?: TwemojiOptions,
  ): string | HTMLElement;
  const twemoji: { parse: typeof parse };
  export default twemoji;
}
