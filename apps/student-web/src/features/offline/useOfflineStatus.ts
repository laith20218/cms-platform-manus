import { useEffect, useState } from 'react';

/**
 * Night Task 3 — honest connectivity signal for the offline shell UX.
 *
 * `navigator.onLine` is the only signal available to a web page; it is
 * boolean (it cannot detect a captive portal or a dead route), so the UI
 * built on top of it must stay honest: the banner says "يبدو أنك دون اتصال"
 * (you appear to be offline) and the offline panel always offers a manual
 * refresh rather than pretending to know the network state.
 */
export function useOfflineStatus(): boolean {
  const [offline, setOffline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine === false : false,
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return offline;
}
