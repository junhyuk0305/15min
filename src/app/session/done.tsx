import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSurface } from '@/components/surface';
import { Body, Button, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { reportError } from '@/lib/report';
import { settingsFor, streakOf, todayStats, totalMinutes } from '@/lib/rules';
import { goalDaysOf, todayKey, todayRow, useApp } from '@/lib/store';
import { B, S, T } from '@/lib/theme';

const t = copy.learn;

/**
 * 완료(기획서 9.2, 11.8). 오늘 분, 누적, 연속, 쿠폰. 격려 한 문장과 흔드는 한 문장.
 * 성과 문장은 items와 item_events로 센다(결정안 15). 못 불러오면 그 줄만 안내한다.
 */
export default function Done() {
  const { earned } = useLocalSearchParams<{ earned?: string }>();
  const state = useApp();
  const goal = state.goal;
  const [stats, setStats] = useState<string[] | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    useApp
      .getState()
      .loadItems()
      .then(
        ({ items, events }) => alive && setStats(t.stats(todayStats(items, events, todayKey()))),
        (e: unknown) => {
          reportError(e, 'stats');
          if (alive) setStatsFailed(true);
        },
      );
    return () => {
      alive = false;
    };
  }, []);

  if (!goal) return null;
  const today = todayKey(state);
  const rec = todayRow(state);
  const minutes = Math.floor((rec?.activeSeconds ?? 0) / 60);
  const mine = goalDaysOf(state);
  const total = totalMinutes(mine);
  const streak = streakOf(mine, goal.firstDay, today, settingsFor(goal, today).weekdays);

  return (
    <Screen footer={<Button title={t.home} onPress={() => router.replace('/')} />}>
      <View style={{ flex: 1, justifyContent: 'center', gap: S.lg, minHeight: 420 }}>
        <View>
          <Label>{t.today}</Label>
          <Text style={T.hero}>{copy.unit.minutes(minutes)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: S.xl }}>
          <View>
            <Label>{t.total}</Label>
            <Text style={T.big}>{copy.unit.minutes(total)}</Text>
          </View>
          <View>
            <Label>{t.streak}</Label>
            <Text style={T.big}>{copy.unit.days(streak)}</Text>
          </View>
        </View>
        <Rule />
        <View style={{ gap: S.xs }}>
          <Body serif>{t.doneLine(minutes)}</Body>
          <Body serif muted>
            {t.doneShake}
          </Body>
        </View>
        {earned === '1' ? <Body>{t.couponEarned}</Body> : null}
        <View style={{ gap: S.xs }}>
          {stats?.map((line) => (
            <Body key={line}>{line}</Body>
          ))}
          {statsFailed ? <Body muted>{t.statsFailed}</Body> : null}
        </View>
      </View>
    </Screen>
  );
}

function Rule() {
  const { p } = useSurface();
  return <View style={{ borderTopWidth: B.hair, borderTopColor: p.line }} />;
}
