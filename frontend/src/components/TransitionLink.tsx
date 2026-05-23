'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useCallback } from 'react';
import type { ComponentProps } from 'react';

// How long to wait for React to update the DOM before we resolve the
// view-transition Promise. Must be shorter than the browser's internal
// timeout (~5 s). 400 ms covers production renders comfortably; in
// Turbopack dev-mode the first compile takes longer but the animation
// will have already finished so the page still updates correctly.
const VT_TIMEOUT_MS = 400;

type Props = ComponentProps<typeof NextLink>;

export function TransitionLink({
  href,
  onClick,
  replace: replaceMode,
  scroll,
  children,
  ...rest
}: Props) {
  const router = useRouter();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (onClick) onClick(e);
      if (e.defaultPrevented) return;

      const anchor = e.currentTarget as HTMLAnchorElement;
      const target = anchor.getAttribute('target');
      if (target && target !== '_self') return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!('startViewTransition' in document)) return;

      e.preventDefault();

      const navigate = () =>
        startTransition(() => {
          if (replaceMode) {
            router.replace(String(href), { scroll: scroll ?? true });
          } else {
            router.push(String(href), { scroll: scroll ?? true });
          }
        });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vt = (document as any).startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            navigate();
            // Resolve after VT_TIMEOUT_MS so the browser never hits its own
            // internal deadline. React continues rendering in the background.
            setTimeout(resolve, VT_TIMEOUT_MS);
          }),
      );

      // Suppress any residual DOMException (AbortError / TimeoutError).
      vt.finished.catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [href, replaceMode, scroll],
  );

  return (
    <NextLink href={href} onClick={handleClick} replace={replaceMode} scroll={scroll} {...rest}>
      {children}
    </NextLink>
  );
}
