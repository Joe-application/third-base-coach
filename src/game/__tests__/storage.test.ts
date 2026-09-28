import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendHistory,
  createProfile,
  DEFAULT_SETTINGS,
  KEYS,
  loadHistory,
  loadProfile,
  loadProfiles,
  loadSettings,
  MAX_PROFILES,
} from '../storage';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('storage', () => {
  it('空でも初期値で読める', () => {
    expect(loadProfiles()).toEqual([]);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadHistory('x')).toEqual([]);
  });

  it('壊れた JSON でも落ちない', () => {
    localStorage.setItem(KEYS.profiles, '{broken');
    localStorage.setItem(KEYS.settings, '[1,2');
    localStorage.setItem(KEYS.profile('a'), '"str"');
    expect(loadProfiles()).toEqual([]);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    const p = loadProfile({ id: 'a', nickname: 'たろう' });
    expect(p.stars).toBe(0);
    expect(p.stats.byOuts[2].plays).toBe(0);
  });

  it('型の違う値は無視して初期値にする', () => {
    localStorage.setItem(KEYS.settings, JSON.stringify({ speed: 'warp', sound: 'yes', thresholds: { 0: 'a', 2: 0.3 } }));
    const s = loadSettings();
    expect(s.speed).toBe('auto');
    expect(s.sound).toBe(true);
    expect(s.thresholds[0]).toBe(0.75);
    expect(s.thresholds[2]).toBe(0.3);
  });

  it('localStorage が使えなくても動く', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
      removeItem() {
        throw new Error('denied');
      },
    };
    expect(loadProfiles()).toEqual([]);
    expect(createProfile('はなこ')?.nickname).toBe('はなこ');
  });

  it('プロフィールは最大10人、履歴は最大100件', () => {
    for (let i = 0; i < MAX_PROFILES; i++) expect(createProfile(`p${i}`)).not.toBeNull();
    expect(createProfile('over')).toBeNull();
    const id = loadProfiles()[0].id;
    const entry = { scenario: { id: 's' }, pSafe: 0.5, decision: 'send' } as never;
    for (let i = 0; i < 120; i++) appendHistory(id, entry);
    expect(loadHistory(id)).toHaveLength(100);
  });
});
