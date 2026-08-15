/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ICP 备案号，配置于本地 .env.local（已 gitignore）。空值时不渲染 Footer。 */
  readonly VITE_ICP_BEIAN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

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
