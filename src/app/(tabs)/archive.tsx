import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ErrorLine } from '@/components/ErrorLine';
import { Glyph } from '@/components/Glyph';
import { Skeleton } from '@/components/Skeleton';
import { StatusBanner } from '@/components/StatusBanner';
import { DAY_SYMBOL, StatusMark } from '@/components/StatusMark';
import { TextButton } from '@/components/TextButton';
import { Body, Button, Card, H1, Screen, useNow } from '@/components/ui';
import { archiveCards, calendarMark, charsByDay, dayId, learnedTotals, monthGrid, shiftMonth, statusByDay, type CalendarMark } from '@/lib/archive';
import { copy } from '@/lib/copy';
import { DUR, EASE } from '@/lib/motion';
import { loadPhaseOf } from '@/lib/selectors';
import { todayKeyOf, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { useLoadPhase } from '@/lib/useLoadPhase';
import { C, HIT, S, T } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

const t = copy.archive;
const LEGEND: CalendarMark[] = ['done', 'miss', 'coupon', 'rest', 'giveup'];
const md = (day: string) => [Number(day.slice(5, 7)), Number(day.slice(8, 10))] as const;
const openDay = (key: string) => router.push(`/archive/${encodeURIComponent(key)}`);
/** 이만큼 옆으로 쓸면 달을 넘긴다 */
const SWIPE = 40;
const SLIDE = 48;

/** 달 넘김 버튼. 24px chevron(갭분석 V12) */
function MonthButton({ dir, label, onPress }: { dir: -1 | 1; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
    >
      <Glyph name={dir < 0 ? 'back' : 'forward'} color={C.ink} />
    </Pressable>
  );
}

/**
 * 달 달력. 상태는 색과 기호를 같이 쓴다 (MP 7.7-3).
 * 달을 넘기면 새 달이 넘긴 쪽에서 220ms 미끄러져 들어온다. 좌우로 쓸어도 넘어간다(갭분석 M11). 줄인 움직임이면 페이드만.
 */
function Calendar({ today }: { today: string }) {
  const goal = useApp((s) => s.goal);
  const days = useApp((s) => s.days);
  const [month, setMonth] = useState(today.slice(0, 7));
  const status = useMemo(() => statusByDay(days, goal?.id ?? null), [days, goal?.id]);
  const doneKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of days) if (d.status === 'done') m.set(d.day, dayId(d.goalId, d.day));
    return m;
  }, [days]);
  const [y, m] = month.split('-').map(Number);
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const o = useSharedValue(1);
  const slide = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateX: x.value }] }));
  const go = useCallback(
    (dir: -1 | 1) => {
      setMonth((cur) => shiftMonth(cur, dir));
      // 다음 달은 오른쪽에서, 이전 달은 왼쪽에서 들어온다
      x.set(reduced ? 0 : dir * SLIDE);
      o.set(0);
      x.set(withTiming(0, { duration: DUR.line, easing: EASE }));
      o.set(withTiming(1, { duration: reduced ? DUR.reduced : DUR.line, easing: EASE }));
    },
    [reduced, x, o],
  );
  // 처리기는 손가락이 움직일 때만 불린다. 렌더 중에 ref를 읽지 않는다
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  }, [go]);
  const pan = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        // 칸(Pressable)이 눌림을 잡고 있어도 옆으로 쓸면 달력이 가져온다
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx <= -SWIPE) goRef.current(1);
          else if (g.dx >= SWIPE) goRef.current(-1);
        },
      }),
    [],
  );

  return (
    <View style={{ gap: S.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <MonthButton dir={-1} label={t.prevMonth} onPress={() => go(-1)} />
        <Text accessibilityRole="header" style={T.h2}>
          {t.month(y, m)}
        </Text>
        <MonthButton dir={1} label={t.nextMonth} onPress={() => go(1)} />
      </View>
      {/* 웹에서 끄는 동안 글자가 선택되면 쓸기가 끊긴다. 요일과 칸 글자는 선택되지 않게 둔다 */}
      <Animated.View {...pan.panHandlers} style={[{ gap: S.sm }, slide]}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {t.weekdays.map((w) => (
            <Text key={w} style={[T.small, { flex: 1, textAlign: 'center', color: C.sub, userSelect: 'none' }]}>
              {w}
            </Text>
          ))}
        </View>
        {monthGrid(month).map((week, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 4 }}>
            {week.map((d, j) => {
              if (!d) return <View key={j} style={{ flex: 1, aspectRatio: 1 }} />;
              const mark = calendarMark(d, status.get(d), goal, today);
              const [mm, dd] = md(d);
              const key = mark === 'done' ? doneKey.get(d) : undefined;
              return (
                <StatusMark
                  key={d}
                  day={dd}
                  status={mark}
                  today={d === today}
                  label={t.cellLabel(mm, dd, t.mark[mark])}
                  onPress={key ? () => openDay(key) : undefined}
                />
              );
            })}
          </View>
        ))}
      </Animated.View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: S.md, rowGap: S.xs }}>
        {LEGEND.map((k) => (
          <Text key={k} style={[T.small, { color: C.sub }]}>{`${DAY_SYMBOL[k]} ${t.mark[k]}`}</Text>
        ))}
      </View>
    </View>
  );
}

export default function Archive() {
  const now = useNow(60_000);
  const state = useApp();
  const today = todayKeyOf(now);
  const extra = useAction();
  const [chars, setChars] = useState<Map<string, number> | null>(null);
  const [learned, setLearned] = useState<{ words: number; expressions: number } | null>(null);
  const { loadWritten, loadItems } = state;
  const hasGoal = !!state.goal;

  // 글자 수와 배운 항목은 캐시하지 않고 탭을 열 때마다 읽는다
  const loadExtra = useCallback(
    () =>
      extra.run(async () => {
        const [written, items] = await Promise.all([loadWritten(), hasGoal ? loadItems() : Promise.resolve(null)]);
        setChars(charsByDay(written));
        setLearned(items ? learnedTotals(items.items, items.events) : null);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasGoal],
  );
  useFocusEffect(
    useCallback(() => {
      void loadExtra();
    }, [loadExtra]),
  );
  // 당겨서 새로고침(갭분석 F8): 캐시와 글자 수를 같이 다시 읽는다
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([state.refresh(), loadExtra()]);
    setRefreshing(false);
  };
  // 300ms가 넘으면 스켈레톤, 10초가 넘거나 실패하면 오류 줄(MP 7.4-2, 갭분석 F6)
  const phase = loadPhaseOf(useLoadPhase(extra.busy), extra.error !== null);

  const cards = archiveCards(state.days, state.goals, chars);
  const goalOf = (id: string) => state.goals.find((g) => g.id === id);

  if (cards.length === 0) {
    return (
      <Screen
        footer={
          hasGoal ? <Button title={t.toHome} onPress={() => router.navigate('/')} /> : <Button title={t.newGoal} onPress={() => router.push('/goal/new')} />
        }
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      >
        <StatusBanner />
        <H1>{t.title}</H1>
        {hasGoal ? <Calendar today={today} /> : null}
        <Body muted>{t.empty}</Body>
      </Screen>
    );
  }

  return (
    <Screen refreshing={refreshing} onRefresh={() => void onRefresh()}>
      <StatusBanner />
      <H1>{t.title}</H1>
      {learned && learned.words + learned.expressions > 0 ? <Body serif>{t.summary(learned.words, learned.expressions)}</Body> : null}
      {phase === 'loading' && !learned ? (
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t.loading} style={{ paddingVertical: 3 }}>
          <Skeleton width="80%" height={19} />
        </View>
      ) : null}
      <Calendar today={today} />
      {phase === 'error' ? (
        <View style={{ gap: S.xs }}>
          <ErrorLine message={extra.message ?? t.extraError} />
          <TextButton title={t.retry} onPress={() => void loadExtra()} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}
      {cards.map((c) => {
        const [mm, dd] = md(c.day);
        const g = goalOf(c.goalId);
        return (
          <Card key={c.key} onPress={() => openDay(c.key)}>
            {/* 누를 수 있다는 표시로 오른쪽 화살표(갭분석 V7) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: S.sm }}>
                  <Text style={[T.small, { color: C.ink }]}>{t.date(mm, dd)}</Text>
                  <Text style={[T.small, { color: C.sub }]}>{t.minutes(c.minutes)}</Text>
                  {c.partner ? <Text style={[T.small, { color: C.sub }]}>{c.partner}</Text> : null}
                  {c.chars !== null ? (
                    <Text style={[T.small, { color: C.sub }]}>{t.chars(c.chars)}</Text>
                  ) : phase === 'loading' ? (
                    <Skeleton width={64} height={12} />
                  ) : null}
                </View>
                <Text style={T.bodySerif} numberOfLines={1}>
                  {c.reasonLine}
                </Text>
                {g?.status === 'achieved' ? <Text style={[T.small, { color: C.sub }]}>{`${t.achieved}: ${g.name}`}</Text> : null}
              </View>
              <Glyph name="forward" size={16} color={C.sub} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
