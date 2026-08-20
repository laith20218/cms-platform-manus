import { useCallback, useEffect, useState } from 'react';

/**
 * Performance optimization hooks for the frontend.
 */

type FirstInputPerformanceEntry = PerformanceEntry & { processingStart: number };
type LayoutShiftPerformanceEntry = PerformanceEntry & { hadRecentInput: boolean; value: number };
type PerformanceMemoryInfo = { usedJSHeapSize: number; totalJSHeapSize: number };
type PerformanceWithMemory = Performance & { memory?: PerformanceMemoryInfo };
type NetworkConnectionInfo = EventTarget & {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
};
type NavigatorWithConnection = Navigator & { connection?: NetworkConnectionInfo };

// ===== Image Lazy Loading =====
export function useLazyImage() {
  const [ref, setRef] = useState<HTMLImageElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    if (!ref) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' }
    );

    observer.observe(ref);
    return () => observer.disconnect();
  }, [ref]);

  const onLoad = useCallback(() => setIsLoaded(true), []);

  return { ref: setRef, isLoaded, isInView, onLoad };
}

// ===== Prefetch on Hover =====
export function usePrefetchOnHover() {
  const prefetch = useCallback((href: string) => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    document.head.appendChild(link);
  }, []);

  return { prefetch };
}

// ===== Debounced Search =====
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// ===== Virtual Scrolling (for large lists) =====
export function useVirtualList<T>(items: T[], itemHeight: number, containerHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 2, // +2 for buffer
    items.length
  );

  const visibleItems = items.slice(startIndex, endIndex);
  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return { visibleItems, totalHeight, offsetY, onScroll, startIndex, endIndex };
}

// ===== Performance Monitor =====
export function usePerformanceMonitor() {
  const [metrics, setMetrics] = useState({
    fcp: 0,       // First Contentful Paint
    lcp: 0,       // Largest Contentful Paint
    fid: 0,       // First Input Delay
    cls: 0,       // Cumulative Layout Shift
    ttfb: 0,      // Time to First Byte
  });

  useEffect(() => {
    // Use Performance Observer API
    if (typeof PerformanceObserver === 'undefined') return;

    // FCP
    const fcpObserver = new PerformanceObserver((list) => {
      const entry = list.getEntries()[0];
      if (entry) setMetrics(m => ({ ...m, fcp: entry.startTime }));
    });
    fcpObserver.observe({ type: 'paint', buffered: true });

    // LCP
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) setMetrics(m => ({ ...m, lcp: lastEntry.startTime }));
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // FID
    const fidObserver = new PerformanceObserver((list) => {
      const entry = list.getEntries()[0] as FirstInputPerformanceEntry | undefined;
      if (entry) setMetrics(m => ({ ...m, fid: entry.processingStart - entry.startTime }));
    });
    fidObserver.observe({ type: 'first-input', buffered: true });

    // CLS
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShiftPerformanceEntry[]) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          setMetrics(m => ({ ...m, cls: clsValue }));
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    // TTFB
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navEntry) {
      setMetrics(m => ({ ...m, ttfb: navEntry.responseStart - navEntry.requestStart }));
    }

    return () => {
      fcpObserver.disconnect();
      lcpObserver.disconnect();
      fidObserver.disconnect();
      clsObserver.disconnect();
    };
  }, []);

  return metrics;
}

// ===== Memory Usage Monitor =====
export function useMemoryUsage() {
  const [memory, setMemory] = useState<{ used: number; total: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const perf = performance as PerformanceWithMemory;
      if (perf.memory) {
        setMemory({
          used: Math.round(perf.memory.usedJSHeapSize / 1048576), // MB
          total: Math.round(perf.memory.totalJSHeapSize / 1048576),
        });
      }
    };

    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, []);

  return memory;
}

// ===== Network Status =====
export function useNetworkStatus() {
  const [status, setStatus] = useState({
    online: navigator.onLine,
    effectiveType: (navigator as NavigatorWithConnection).connection?.effectiveType || 'unknown',
    downlink: (navigator as NavigatorWithConnection).connection?.downlink || 0,
    rtt: (navigator as NavigatorWithConnection).connection?.rtt || 0,
  });

  useEffect(() => {
    const handleOnline = () => setStatus(s => ({ ...s, online: true }));
    const handleOffline = () => setStatus(s => ({ ...s, online: false }));
    const handleConnectionChange = () => {
      const conn = (navigator as NavigatorWithConnection).connection;
      if (conn) {
        setStatus(s => ({
          ...s,
          effectiveType: conn.effectiveType || 'unknown',
          downlink: conn.downlink || 0,
          rtt: conn.rtt || 0,
        }));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    (navigator as NavigatorWithConnection).connection?.addEventListener('change', handleConnectionChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      (navigator as NavigatorWithConnection).connection?.removeEventListener('change', handleConnectionChange);
    };
  }, []);

  return status;
}
