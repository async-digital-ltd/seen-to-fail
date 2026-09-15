import type { ReactElement } from 'react';
import { useState } from 'react';

type Outcome = 'idle' | 'copied' | 'failed';

const words = {
  idle: '',
  copied: 'Copied',
  failed: "Couldn't copy",
} as const satisfies Record<Outcome, string>;

interface CopyLinkProps {
  /** The page's own address, as the router writes it, without the origin. */
  readonly href: string;
  /**
   * Whether the address is one not to pass on. The bar sets this while the
   * address holds a filter the language refused: the notice beside the button
   * already says the link was not read, and a copy of it would carry the same
   * fault to the next reader. Clear gives a clean address to copy instead.
   */
  readonly disabled: boolean;
}

/**
 * Puts the page's address on the clipboard, and says so beside the button.
 *
 * The address is the router's, joined onto the origin the page is served
 * from, which is what the address bar shows wherever the app is deployed. It
 * is built rather than read off `window.location` so that a test, whose
 * router is not the browser's, can see the filter in what was copied.
 *
 * The word beside the button is a status region, so a screen reader hears
 * "Copied" without focus leaving the button. Whoever renders this keys it on
 * the address, so the word clears when the filter changes and cannot claim a
 * link that is no longer the one on screen.
 */
export function CopyLink({ href, disabled }: CopyLinkProps): ReactElement {
  const [outcome, setOutcome] = useState<Outcome>('idle');

  const copy = async (): Promise<void> => {
    try {
      const link = new URL(href, window.location.href).toString();
      await navigator.clipboard.writeText(link);
      setOutcome('copied');
    } catch {
      // The clipboard is refused outside a secure context and by some
      // permission settings. The reader can still copy the address bar.
      setOutcome('failed');
    }
  };

  return (
    <span className="copy-link">
      <button
        type="button"
        className="button"
        disabled={disabled}
        onClick={() => {
          void copy();
        }}
      >
        Copy link
      </button>{' '}
      <span role="status" className="copy-link__outcome">
        {words[outcome]}
      </span>
    </span>
  );
}
