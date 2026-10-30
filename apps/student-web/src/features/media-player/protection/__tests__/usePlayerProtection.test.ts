import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePlayerProtection } from '../usePlayerProtection';

/**
 * Wave 11.8 / F2 (supervisor decision D2) — the text-layer carve-out:
 * selectstart passes through inside [data-pdf-text-layer] (the highlighter's
 * selection surface) while copy/cut/contextmenu REMAIN blocked there, and
 * selection stays blocked everywhere else inside the player.
 */

describe('usePlayerProtection — pdf text layer allowlist (D2)', () => {
  let container: HTMLDivElement;
  let textLayer: HTMLDivElement;
  let plainZone: HTMLParagraphElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    textLayer = document.createElement('div');
    textLayer.setAttribute('data-pdf-text-layer', 'true');
    const span = document.createElement('span');
    span.textContent = 'نص عربي قابل للتظليل';
    textLayer.appendChild(span);
    plainZone = document.createElement('p');
    plainZone.textContent = 'محتوى عادي';
    container.append(textLayer, plainZone);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  function mount() {
    const harness = renderHook(() => usePlayerProtection({ enabled: true }));
    // setContainer flips hook state → listeners attach in an effect. The flip
    // must happen inside act() or the dispatches below race the attachment.
    act(() => { harness.result.current.setContainer(container); });
    return harness;
  }

  function dispatchSelectStart(target: Element): boolean {
    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  function selectSpanText() {
    const range = document.createRange();
    range.selectNodeContents(textLayer.firstChild as Node);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }

  it('allows selectstart inside the pdf text layer (highlighter surface)', () => {
    mount();
    const span = textLayer.firstChild as Element;
    expect(dispatchSelectStart(span)).toBe(false);
  });

  it('allows selectstart when the target is a TEXT NODE inside the layer (native drag-selection anchors on text)', () => {
    mount();
    const textNode = textLayer.firstChild?.firstChild as Node;
    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: textNode });
    textLayer.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('still blocks selectstart outside the text layer', () => {
    mount();
    expect(dispatchSelectStart(plainZone)).toBe(true);
  });

  it('copy remains blocked even when the selection lives in the text layer', () => {
    mount();
    selectSpanText();
    const event = new Event('copy', { bubbles: true, cancelable: true });
    textLayer.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('contextmenu remains blocked inside the text layer', () => {
    mount();
    const event = new Event('contextmenu', { bubbles: true, cancelable: true });
    textLayer.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('cut remains blocked inside the text layer', () => {
    mount();
    selectSpanText();
    const event = new Event('cut', { bubbles: true, cancelable: true });
    textLayer.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
