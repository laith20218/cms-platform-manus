import { useEffect, useRef, useCallback } from 'react';
import { apiClient } from '@/services/api-client';

type AllowedSecurityEvent = 'copy_attempt' | 'devtools_detected' | 'screenshot_attempt';
const MIN_REPORT_INTERVAL_MS = 15_000;
const lastReportedAt = new Map<AllowedSecurityEvent, number>();

function reportSecurityEvent(eventType: AllowedSecurityEvent) {
  const now = Date.now();
  const last = lastReportedAt.get(eventType) ?? 0;
  if (now - last < MIN_REPORT_INTERVAL_MS) return;
  lastReportedAt.set(eventType, now);
  apiClient.post('/security/events', { eventType }).catch(() => {});
}

/** Browser-side deterrents only. The server remains the authorization decision point. */
export function useAntiCopy(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    const handleCopy = (event: ClipboardEvent) => { event.preventDefault(); reportSecurityEvent('copy_attempt'); };
    const handleCut = (event: ClipboardEvent) => { event.preventDefault(); reportSecurityEvent('copy_attempt'); };
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) event.preventDefault();
    };
    const handleSelectStart = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) event.preventDefault();
    };
    const handleDragStart = (event: DragEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'IMG' || target.tagName === 'SVG') event.preventDefault();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput = ['INPUT', 'TEXTAREA'].includes(target.tagName);
      if (!isInput && (event.ctrlKey || event.metaKey) && ['c', 'x', 's', 'p', 'u'].includes(event.key.toLowerCase())) event.preventDefault();
      if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(event.key.toLowerCase()))) {
        event.preventDefault();
        reportSecurityEvent('devtools_detected');
      }
    };
    document.addEventListener('copy', handleCopy); document.addEventListener('cut', handleCut); document.addEventListener('contextmenu', handleContextMenu); document.addEventListener('selectstart', handleSelectStart); document.addEventListener('dragstart', handleDragStart); document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('copy', handleCopy); document.removeEventListener('cut', handleCut); document.removeEventListener('contextmenu', handleContextMenu); document.removeEventListener('selectstart', handleSelectStart); document.removeEventListener('dragstart', handleDragStart); document.removeEventListener('keydown', handleKeyDown); };
  }, [enabled]);
}

export function useDevToolsDetection(enabled: boolean = true) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const detect = () => {
      const observed = window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160;
      if (observed) { reportSecurityEvent('devtools_detected'); document.body.style.filter = 'blur(3px)'; }
      else document.body.style.filter = '';
    };
    intervalRef.current = setInterval(detect, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); document.body.style.filter = ''; };
  }, [enabled]);
}

export function useWatermark(studentName: string, studentPhone: string, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || !studentName) return;
    const watermark = document.createElement('div');
    watermark.id = 'cms-watermark';
    watermark.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;display:flex;flex-wrap:wrap;justify-content:space-around;align-items:center;opacity:.03;font-family:'Cairo',sans-serif;font-size:14px;font-weight:600;color:#1976D2;transform:rotate(-15deg);overflow:hidden;";
    const text = `${studentName} - ${studentPhone} - CMS - ${new Date().toLocaleString('ar')}`;
    for (let index = 0; index < 40; index++) { const span = document.createElement('span'); span.textContent = text; span.style.cssText = 'margin:30px;white-space:nowrap;'; watermark.appendChild(span); }
    document.body.appendChild(watermark);
    return () => document.getElementById('cms-watermark')?.remove();
  }, [studentName, studentPhone, enabled]);
}

export function useScreenshotDetection(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    let wasFocused = true;
    const handleBlur = () => { if (wasFocused) { wasFocused = false; reportSecurityEvent('screenshot_attempt'); } };
    const handleFocus = () => { wasFocused = true; };
    window.addEventListener('blur', handleBlur); window.addEventListener('focus', handleFocus);
    return () => { window.removeEventListener('blur', handleBlur); window.removeEventListener('focus', handleFocus); };
  }, [enabled]);
}

export function useContentProtection(options: { studentName?: string; studentPhone?: string; antiCopy?: boolean; devToolsDetection?: boolean; watermark?: boolean; screenshotDetection?: boolean; } = {}) {
  const { studentName = '', studentPhone = '', antiCopy = true, devToolsDetection = true, watermark = true, screenshotDetection = false } = options;
  useAntiCopy(antiCopy); useDevToolsDetection(devToolsDetection); useWatermark(studentName, studentPhone, watermark); useScreenshotDetection(screenshotDetection);
}

export function useSecurityReporting() {
  const reportEvent = useCallback((eventType: AllowedSecurityEvent) => reportSecurityEvent(eventType), []);
  return { reportEvent };
}
