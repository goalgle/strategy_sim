// 보상 카드 — 임계·뽑기(버프+리젠, 결정론)·제시·선택·차단·리젠.
import { describe, expect, it } from 'vitest';
import { ALL_BUFFS, BUFFS, grantPlayerBuffs } from './buffs';
import { applyIntent } from './intent';
import { lostRegenCandidates, maybeOfferReward, ownedBuffs, rewardThreshold, rollReward } from './rewards';
import { createStandardGame } from './setup';
import { tick } from './tick';
import type { GameState, Piece } from './types';

function withAllBuffs(g: GameState): GameState {
  let s = g;
  for (const b of ALL_BUFFS) s = { ...s, pieces: grantPlayerBuffs(s.pieces, [b]) };
  return s;
}

/** id로 말을 제거(잃은 상태 시뮬). 원위치는 비게 됨. */
function lose(g: GameState, id: string): GameState {
  return { ...g, pieces: g.pieces.filter((p) => p.id !== id) };
}

describe('보상 임계(rewardThreshold)', () => {
  it('점점 커진다: 50, 150, 300, 500', () => {
    expect([0, 1, 2, 3].map(rewardThreshold)).toEqual([50, 150, 300, 500]);
  });
});

describe('리젠 후보(lostRegenCandidates)', () => {
  it('잃은 말만, 좌/우 라벨로', () => {
    const g = lose(createStandardGame({ seed: 1 }), 'p-horse-0'); // 좌측 마(col1)
    const cands = lostRegenCandidates(g);
    expect(cands).toContainEqual({ type: 'regen', pieceId: 'p-horse-0', label: '좌측 마' });
    // 우측 마(p-horse-1)는 아직 살아있으므로 후보 아님
    expect(cands.some((c) => c.type === 'regen' && c.pieceId === 'p-horse-1')).toBe(false);
  });

  it('원위치가 점령되면 후보에서 제외', () => {
    let g = lose(createStandardGame({ seed: 1 }), 'p-horse-0');
    const home = g.roster.find((r) => r.id === 'p-horse-0')!;
    // 적 말을 원위치에 둠
    const blocker: Piece = { id: 'x', kind: 'pawn', family: 'chess', side: 'enemy', at: { col: home.col, row: home.row }, isRoyal: false };
    g = { ...g, pieces: [...g.pieces, blocker] };
    expect(lostRegenCandidates(g).some((c) => c.type === 'regen' && c.pieceId === 'p-horse-0')).toBe(false);
  });

  it('잃은 게 없으면 빈 배열', () => {
    expect(lostRegenCandidates(createStandardGame())).toEqual([]);
  });
});

describe('보상 뽑기(rollReward)', () => {
  it('잃은 말이 있으면 버프1 + 리젠1', () => {
    const g = lose(createStandardGame({ seed: 7 }), 'p-chariot-0');
    const { options } = rollReward(g);
    expect(options).toHaveLength(2);
    expect(options.filter((o) => o.type === 'buff')).toHaveLength(1);
    expect(options.filter((o) => o.type === 'regen')).toHaveLength(1);
  });

  it('잃은 말이 없으면 버프 2장으로 채움', () => {
    const { options } = rollReward(createStandardGame({ seed: 7 }));
    expect(options).toHaveLength(2);
    expect(options.every((o) => o.type === 'buff')).toBe(true);
  });

  it('버프를 다 가졌고 잃은 말만 있으면 리젠으로 채움', () => {
    const g = lose(withAllBuffs(createStandardGame({ seed: 2 })), 'p-cannon-0');
    const { options } = rollReward(g);
    expect(options.every((o) => o.type === 'regen')).toBe(true);
    expect(options.length).toBeGreaterThanOrEqual(1);
  });

  it('같은 시드·상태면 같은 카드(결정론)', () => {
    const a = rollReward(lose(createStandardGame({ seed: 9 }), 'p-horse-0')).options;
    const b = rollReward(lose(createStandardGame({ seed: 9 }), 'p-horse-0')).options;
    expect(a).toEqual(b);
  });
});

describe('보상 제시(maybeOfferReward)', () => {
  it('임계 도달 시 2장 제시 + 이벤트', () => {
    const g = { ...createStandardGame({ seed: 1 }), score: 50 };
    const off = maybeOfferReward(g);
    expect(off.state.reward?.options).toHaveLength(2);
    expect(off.events.some((e) => e.t === 'rewardOffered')).toBe(true);
  });

  it('임계 미달이면 제시 안 함', () => {
    expect(maybeOfferReward({ ...createStandardGame({ seed: 1 }), score: 49 }).state.reward).toBeUndefined();
  });

  it('줄 카드가 하나도 없으면(전부 보유 + 잃은 말 없음) 제시 안 함', () => {
    const g = { ...withAllBuffs(createStandardGame({ seed: 1 })), score: 9999 };
    expect(maybeOfferReward(g).state.reward).toBeUndefined();
  });
});

describe('보상 선택(pickReward)', () => {
  it('버프 선택 → 말 종류 전체 강화, reward 해제·카운트+1', () => {
    const offered = maybeOfferReward({ ...createStandardGame({ seed: 1 }), score: 50 }).state;
    const idx = offered.reward!.options.findIndex((o) => o.type === 'buff');
    const card = offered.reward!.options[idx]!;
    const buff = card.type === 'buff' ? card.buff : ALL_BUFFS[0]!;
    const kind = BUFFS[buff].appliesTo;
    const r = applyIntent(offered, { t: 'pickReward', index: idx });
    expect(r.state.reward).toBeUndefined();
    expect(r.state.rewardCount).toBe(1);
    expect(r.state.pieces.filter((p) => p.side === 'player' && p.kind === kind).every((p) => p.buffs?.includes(buff))).toBe(true);
    expect(r.events.some((e) => e.t === 'rewardPicked')).toBe(true);
  });

  it('리젠 선택 → 잃은 말이 원위치에 부활', () => {
    const lost = lose(createStandardGame({ seed: 1 }), 'p-horse-0');
    const home = lost.roster.find((x) => x.id === 'p-horse-0')!;
    const offered = maybeOfferReward({ ...lost, score: 50 }).state;
    const idx = offered.reward!.options.findIndex((o) => o.type === 'regen' && o.pieceId === 'p-horse-0');
    expect(idx).toBeGreaterThanOrEqual(0); // 리젠 카드가 떠 있어야
    const r = applyIntent(offered, { t: 'pickReward', index: idx });
    const revived = r.state.pieces.find((p) => p.id === 'p-horse-0');
    expect(revived?.at).toEqual({ col: home.col, row: home.row });
  });

  it('리젠된 말에도 보유 버프가 자동 적용', () => {
    let g = lose(createStandardGame({ seed: 1 }), 'p-horse-0');
    g = { ...g, pieces: grantPlayerBuffs(g.pieces, ['horseLeap']), score: 50 }; // 마 점프 보유 중
    const offered = maybeOfferReward(g).state;
    const idx = offered.reward!.options.findIndex((o) => o.type === 'regen' && o.pieceId === 'p-horse-0');
    const r = applyIntent(offered, { t: 'pickReward', index: idx });
    expect(r.state.pieces.find((p) => p.id === 'p-horse-0')?.buffs).toContain('horseLeap');
  });

  it('제시 중에는 다른 입력(이동 등) 무시', () => {
    const offered = maybeOfferReward({ ...createStandardGame({ seed: 1 }), score: 50 }).state;
    const piece = offered.pieces.find((p) => p.side === 'player')!;
    expect(applyIntent(offered, { t: 'select', pieceId: piece.id }).state.selection).toBeUndefined();
  });
});

describe('보상 제시 중 하강 정지(tick)', () => {
  it('reward가 있으면 dt가 커도 사이클이 진행되지 않음', () => {
    const g: GameState = { ...createStandardGame({ seed: 1 }), reward: { options: [{ type: 'buff', buff: 'horseLeap' }] } };
    const r = tick(g, { dt: 100000 });
    expect(r.state.hourglass.cycle).toBe(g.hourglass.cycle);
    expect(r.state.hourglass.progress).toBe(0);
  });
});

describe('소진', () => {
  it('버프 전부 보유 + 잃은 말 없으면 ownedBuffs 6, 더 제시 안 함', () => {
    const g = { ...withAllBuffs(createStandardGame({ seed: 5 })), score: 999999 };
    expect(ownedBuffs(g).size).toBe(ALL_BUFFS.length);
    expect(maybeOfferReward(g).state.reward).toBeUndefined();
  });
});
