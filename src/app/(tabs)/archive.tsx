import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Card, H1, Label, Screen, useNow } from '@/components/ui';
import { copy } from '@/lib/copy';
import { addDays, dayKeyOf } from '@/lib/rules';
import { activeGoalOf, findBot, keyOf, useApp, visibleRecords } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

const t = copy.archive;

/** 최근 5주 달력. 완료는 검정, 쿠폰은 회색 테두리, 실패는 빨강. */
function Calendar() {
  const now = useNow(60_000);
  const state = useApp();
  const goal = activeGoalOf(state);
  if (!goal) return null;
  const today = dayKeyOf(now);
  const first = dayKeyOf(goal.createdAt);
  const days = Array.from({ length: 35 }, (_, i) => addDays(today, i - 34));
  return (
    <View style={{ gap: S.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {days.map((d) => {
          const st = state.records[keyOf(goal.id, d)]?.status;
          const before = d < first;
          const missed = !before && d < today && st !== 'done' && st !== 'coupon' && st !== 'paused';
          const bg = st === 'done' ? C.ink : missed ? C.red : 'transparent';
          return (
            <View
              key={d}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: bg,
                borderWidth: st === 'coupon' || d === today ? 2 : 1,
                borderColor: st === 'coupon' ? C.sub : before ? 'transparent' : C.line,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={[T.small, { color: st === 'done' || missed ? C.card : C.sub }]}>{Number(d.slice(8))}</Text>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: S.md }}>
        <Text style={[T.small, { color: C.ink }]}>{`■ ${t.done}`}</Text>
        <Text style={[T.small, { color: C.sub }]}>{`□ ${t.coupon}`}</Text>
        <Text style={[T.small, { color: C.red }]}>{`■ ${t.missed}`}</Text>
      </View>
    </View>
  );
}

export default function Archive() {
  const state = useApp();
  const cards = visibleRecords(state)
    .filter((r) => r.status === 'done')
    .sort((a, b) => (a.day < b.day ? 1 : -1));
  const goalName = (id: string) => state.goals.find((g) => g.id === id)?.name ?? '';

  return (
    <Screen>
      <H1>{t.title}</H1>
      <Calendar />
      {cards.length === 0 ? <Body muted>{t.empty}</Body> : null}
      {cards.map((r) => (
        <Card key={keyOf(r.goalId, r.day)} onPress={() => router.push(`/archive/${encodeURIComponent(keyOf(r.goalId, r.day))}`)}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={T.h2}>{r.day.replace(/-/g, '.')}</Text>
            <Text style={T.h2}>{t.minutes(Math.floor(r.activeSeconds / 60))}</Text>
          </View>
          <Label>{`${findBot(state.customBots, r.botId).name}   ${t.chars(r.chars)}`}</Label>
          <Text style={[T.small, { color: C.sub }]} numberOfLines={1}>
            {r.reason}
          </Text>
          {state.goals.find((g) => g.id === r.goalId)?.status === 'achieved' ? (
            <Text style={[T.small, { color: C.sub }]}>{`${t.achieved}: ${goalName(r.goalId)}`}</Text>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
