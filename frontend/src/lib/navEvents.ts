/**
 * Minimal pub-sub untuk sinyal "navigasi dimulai".
 * TransitionLink memanggil navEvents.emit() saat link diklik.
 * NavigationLoader subscribe dan menampilkan loading screen
 * hingga usePathname() berubah.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export const navEvents = {
  /** Subscribe — kembalikan fungsi unsubscribe */
  on: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Emit ke semua subscriber */
  emit: (): void => {
    listeners.forEach(fn => fn());
  },
};
