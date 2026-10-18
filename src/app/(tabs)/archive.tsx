import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { StatusBanner } from '@/components/StatusBanner';
import { DAY_SYMBOL, StatusMark } from '@/components/StatusMark';
import { TextButton } from '@/components/TextButton';
import { Body, Button, Card, H1, Screen, useNow } from '@/components/ui';
import { archiveCards, calendarMark, charsByDay, dayId, learnedTotals, monthGrid, shiftMonth, statusByDay, type CalendarMark } from '@/lib/archive';
import { copy } from '@/lib/copy';
import { deviceTz, todayKeyOf, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { C, S, T } from '@/lib/theme';

const t = copy.archive;
const LEGEND: CalendarMark[] = ['done', 'miss', 'coupon', 'rest', 'giveup'];
const md = (day: string) => [Number(day.slice(5, 7)), Number(day.slice(8, 10))] as const;
const openDay = (key: string) => router.push(`/archive/${encodeURIComponent(key)}`);

/** 달 달력. 상태는 색과 기호를 같이 쓴다 (MP 7.7-3) */
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

  return (
    <View style={{ gap: S.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TextButton title="‹" accessibilityLabel={t.prevMonth} onPress={() => setMonth(shiftMonth(month, -1))} />
        <Text accessibilityRole="header" style={T.h2}>
          {t.month(y, m)}
        </Text>
        <TextButton title="›" accessibilityLabel={t.nextMonth} onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {t.weekdays.map((w) => (
          <Text key={w} style={[T.small, { flex: 1, textAlign: 'center', color: C.sub }]}>
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
  const today = todayKeyOf(state, now, deviceTz);
  const extra = useAction();
  const [chars, setChars] = useState<Map<string, number> | null>(null);
  const [learned, setLearned] = useState<{ words: number; expressions: number } | null>(null);
  const { loadWritten, loadItems } = state;
  const hasGoal = !!state.goal;

  // 글자 수와 배운 항목은 캐시하지 않고 탭을 열 때마다 읽는다
  useFocusEffect(
    useCallback(() => {
      void extra.run(async () => {
        const [written, items] = await Promise.all([loadWritten(), hasGoal ? loadItems() : Promise.resolve(null)]);
        setChars(charsByDay(written));
        setLearned(items ? learnedTotals(items.items, items.events) : null);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasGoal]),
  );

  const cards = archiveCards(state.days, state.goals, chars);
  const goalOf = (id: string) => state.goals.find((g) => g.id === id);

  if (cards.length === 0) {
    return (
      <Screen
        footer={
          hasGoal ? <Button title={t.toHome} onPress={() => router.navigate('/')} /> : <Button title={t.newGoal} onPress={() => router.push('/goal/new')} />
        }
      >
        <StatusBanner />
        <H1>{t.title}</H1>
        {hasGoal ? <Calendar today={today} /> : null}
        <Body muted>{t.empty}</Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <StatusBanner />
      <H1>{t.title}</H1>
      {learned && learned.words + learned.expressions > 0 ? <Body serif>{t.summary(learned.words, learned.expressions)}</Body> : null}
      <Calendar today={today} />
      <ErrorLine message={extra.message} />
      {cards.map((c) => {
        const [mm, dd] = md(c.day);
        const g = goalOf(c.goalId);
        return (
          <Card key={c.key} onPress={() => openDay(c.key)}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: S.sm }}>
              <Text style={[T.small, { color: C.ink }]}>{t.date(mm, dd)}</Text>
              <Text style={[T.small, { color: C.sub }]}>{t.minutes(c.minutes)}</Text>
              {c.partner ? <Text style={[T.small, { color: C.sub }]}>{c.partner}</Text> : null}
              {c.chars !== null ? <Text style={[T.small, { color: C.sub }]}>{t.chars(c.chars)}</Text> : null}
            </View>
            <Text style={T.bodySerif} numberOfLines={1}>
              {c.reasonLine}
            </Text>
            {g?.status === 'achieved' ? <Text style={[T.small, { color: C.sub }]}>{`${t.achieved}: ${g.name}`}</Text> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
