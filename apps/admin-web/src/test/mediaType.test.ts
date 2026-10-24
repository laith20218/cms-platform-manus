import { describe, it, expect } from 'vitest';
import { sniffEpisodeMediaType } from '../lib/mediaType';

const ALLOW = ['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'];

const file = (name: string, type: string): File => new File([new Uint8Array([1, 2, 3])], name, { type });

// ================= Push 7: honest media-type sniffing =================

describe('sniffEpisodeMediaType', () => {
  it('trusts the browser-reported type when it is on the allow-list', () => {
    expect(sniffEpisodeMediaType(file('clip.mp4', 'video/mp4'), ALLOW)).toBe('video/mp4');
    expect(sniffEpisodeMediaType(file('song.mp3', 'audio/mpeg'), ALLOW)).toBe('audio/mpeg');
  });

  it('falls back to the extension when the browser reports no type — including Arabic filenames', () => {
    // The user's real-world case: a real MP3 whose name carries Arabic characters.
    expect(sniffEpisodeMediaType(file('test-عربي.mp3', ''), ALLOW)).toBe('audio/mpeg');
    expect(sniffEpisodeMediaType(file('درس-الفصل-الأول.mp4', ''), ALLOW)).toBe('video/mp4');
  });

  it('returns null for an unrecognized (Arabic) extension — never invents a type', () => {
    // `mp3.رقيق`: the extension itself is Arabic → unknown → null (was: video/mp4 by the old fallback!).
    expect(sniffEpisodeMediaType(file('mp3.رقيق', ''), ALLOW)).toBeNull();
  });

  it('rejects browser-reported types that are off the allow-list', () => {
    expect(sniffEpisodeMediaType(file('notes.pdf', 'application/pdf'), ALLOW)).toBeNull();
    expect(sniffEpisodeMediaType(file('archive.zip', 'application/zip'), ALLOW)).toBeNull();
  });

  it('maps every supported extension to its correct MIME', () => {
    expect(sniffEpisodeMediaType(file('a.m4a', ''), ALLOW)).toBe('audio/mp4');
    expect(sniffEpisodeMediaType(file('b.wav', ''), ALLOW)).toBe('audio/wav');
    expect(sniffEpisodeMediaType(file('c.m4v', ''), ALLOW)).toBe('video/mp4');
    expect(sniffEpisodeMediaType(file('d.mov', ''), ALLOW)).toBe('video/quicktime');
    expect(sniffEpisodeMediaType(file('e.webm', ''), ALLOW)).toBe('video/webm');
  });

  it('matches extensions case-insensitively', () => {
    expect(sniffEpisodeMediaType(file('SONG.MP3', ''), ALLOW)).toBe('audio/mpeg');
    expect(sniffEpisodeMediaType(file('Clip.Mp4', ''), ALLOW)).toBe('video/mp4');
  });

  it('returns null for files without a usable extension or name signal', () => {
    expect(sniffEpisodeMediaType(file('no-extension', ''), ALLOW)).toBeNull();
    expect(sniffEpisodeMediaType(file('trailing-dot.', ''), ALLOW)).toBeNull();
    expect(sniffEpisodeMediaType(file('unknown.xyz', ''), ALLOW)).toBeNull();
  });
});
