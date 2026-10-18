import { Text, View } from 'react-native';
import { StatusMark } from '@/components/StatusMark';
import { useInk } from '@/components/surface';
import { weekStrip } from '@/lib/archive';
import { copy } from '@/lib/copy';
import type { AppGoal } from '@/lib/model';
import type { DayRow } from '@/lib/rules';
import { S, T } from '@/lib/theme';

const a = copy.archive;

/** 홈 아래 이번 주 7칸(메가프롬프트 3절 "홈 이번 주 띠", 갭분석 V3). 기록 탭 달력과 같은 기호. 누르지 않는 표시다 */
export function WeekStrip({ days, goal, today }: { days: readonly DayRow[]; goal: AppGoal; today: string }) {
  const { sub } = useInk();
  const cells = weekStrip(days, goal, today);
  return (
    <View style={{ gap: S.xs }}>
      <Text style={[T.label, { color: sub }]}>{copy.home.week}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {a.weekdays.map((w) => (
          <Text key={w} style={[T.small, { flex: 1, textAlign: 'center', color: sub }]}>
            {w}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {cells.map((c) => {
          const [m, d] = [Number(c.day.slice(5, 7)), Number(c.day.slice(8, 10))];
          return <StatusMark key={c.day} day={d} status={c.mark} today={c.day === today} label={a.cellLabel(m, d, a.mark[c.mark])} />;
        })}
      </View>
    </View>
  );
}
