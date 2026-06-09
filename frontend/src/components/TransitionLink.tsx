'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { ComponentProps } from 'react';
import { navEvents } from '@/lib/navEvents';

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

      e.preventDefault();
      navEvents.emit();

      if (replaceMode) {
        router.replace(String(href), { scroll: scroll ?? true });
      } else {
        router.push(String(href), { scroll: scroll ?? true });
      }
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
