import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Appear } from '@/components/Appear';
import { CountUp } from '@/components/CountUp';
import { Skeleton } from '@/components/Skeleton';
import { useSurface } from '@/components/surface';
import { Body, Button, Card, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { success } from '@/lib/haptics';
import { DUR } from '@/lib/motion';
import { reportError } from '@/lib/report';
import { addDays, fmtClock, settingsFor, streakOf, todayStats, totalMinutes, type Goal } from '@/lib/rules';
import { couponEarnedOf, loadPhaseOf, nextStudyDay } from '@/lib/selectors';
import { goalDaysOf, todayKey, todayRow, useApp } from '@/lib/store';
import { useLoadPhase } from '@/lib/useLoadPhase';
import { B, S, T } from '@/lib/theme';

/** 오늘, 누적, 연속을 차례로 센다. 각 800ms, 150ms 간격(갭분석 M10) */
const STAGGER = 150;
const COUNT_END = DUR.count + STAGGER * 2;

const t = copy.learn;

/** 다음 학습일과 시작 시각. 내일이면 "내일 21:30" */
function nextWhen(goal: Goal, today: string): string | null {
  const day = nextStudyDay(goal, addDays(today, 1));
  if (!day) return null;
  const clock = fmtClock(settingsFor(goal, day).startMinutes);
  return day === addDays(today, 1) ? copy.home.tomorrowAt(clock) : copy.home.dateAt(Number(day.slice(5, 7)), Number(day.slice(8, 10)), clock);
}

/**
 * 완료(기획서 9.2, 11.8). 오늘 분, 누적, 연속, 쿠폰. 격려 한 문장과 흔드는 한 문장. 다음 학습 시각.
 * 성과 문장은 items와 item_events로 센다(결정안 15). 읽는 동안 스켈레톤, 못 불러오면 그 줄만 안내한다.
 * 숫자는 0에서 세어 올라가고 success 햅틱 1회(3절 "완료 연출"). 쿠폰을 받았으면 숫자 뒤에 카드가 올라온다.
 */
export default function Done() {
  const { earned } = useLocalSearchParams<{ earned?: string }>();
  const state = useApp();
  const goal = state.goal;
  const [stats, setStats] = useState<string[] | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  // 300ms가 넘으면 스켈레톤, 10초가 넘으면 못 불러온 것으로 본다(MP 7.4-2)
  const statsPhase = loadPhaseOf(useLoadPhase(!stats && !statsFailed), statsFailed);

  useEffect(() => {
    success();
  }, []);

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
  const when = nextWhen(goal, today);
  const coupon = earned === '1' ? couponEarnedOf(goal) : null;

  return (
    <Screen footer={<Button title={t.home} onPress={() => router.replace('/')} />}>
      <View style={{ flex: 1, justifyContent: 'center', gap: S.lg, minHeight: 420 }}>
        <View>
          <Label>{t.today}</Label>
          <CountUp value={minutes} format={copy.unit.minutes} style={T.hero} />
        </View>
        <View style={{ flexDirection: 'row', gap: S.xl }}>
          <View>
            <Label>{t.total}</Label>
            <CountUp value={total} format={copy.unit.minutes} style={T.big} delay={STAGGER} />
          </View>
          <View>
            <Label>{t.streak}</Label>
            {/* 오늘 완료로 연속이 1 늘었으니 다 센 뒤 한 번 커졌다 돌아온다 */}
            <CountUp value={streak} format={copy.unit.days} style={T.big} delay={STAGGER * 2} pop={streak > 0} />
          </View>
        </View>
        <Rule />
        <View style={{ gap: S.xs }}>
          <Body serif>{t.doneLine(minutes)}</Body>
          <Body serif muted>
            {t.doneShake}
          </Body>
          {when ? <Body>{t.nextStudy(when)}</Body> : null}
        </View>
        {coupon ? (
          // 쿠폰 획득은 따로 카드로, 숫자를 다 센 뒤 아래에서 올라온다(갭분석 3.1-11, F9)
          <Appear delay={COUNT_END} from={16}>
            <Card>
              <Body>{copy.coupon.earnedCard(coupon.got, coupon.next)}</Body>
            </Card>
          </Appear>
        ) : null}
        <View style={{ gap: S.xs }}>
          {stats?.map((line) => (
            <Body key={line}>{line}</Body>
          ))}
          {statsPhase === 'error' ? <Body muted>{t.statsFailed}</Body> : null}
          {statsPhase === 'loading' ? (
            <View accessible accessibilityRole="progressbar" accessibilityLabel={t.statsLoading} style={{ gap: S.sm, paddingVertical: 3 }}>
              <Skeleton width="88%" height={16} />
              <Skeleton width="64%" height={16} />
            </View>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

function Rule() {
  const { p } = useSurface();
  return <View style={{ borderTopWidth: B.hair, borderTopColor: p.line }} />;
}
