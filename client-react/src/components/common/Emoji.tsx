import { useMemo } from 'react';
import twemoji from 'twemoji';

// Replaces the Vue global `<emoji>` directive. Renders a twemoji-parsed SVG
// via dangerouslySetInnerHTML (twemoji.parse returns an <img> string).
export default function Emoji({ emoji }: { emoji: string }) {
  const html = useMemo(
    () => twemoji.parse(emoji, { base: '/', folder: 'svg', ext: '.svg' }) as string,
    [emoji],
  );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
