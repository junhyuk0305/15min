import { View } from 'react-native';
import { AccountMenu } from '@/components/AccountLinks';
import { Header } from '@/components/Header';
import { Body, H1, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { GIVEUP_MAX_CONFIRMED } from '@/lib/rules';
import { useBlockBack } from '@/lib/useBlockBack';
import { S } from '@/lib/theme';

const t = copy.banned;

/** 영구 정지 안내. 나가는 길 대신 헤더에 이유 한 줄을 두고, 계정 삭제와 약관은 헤더 "⋯"에 둔다 (기획서 8.4, 결정로그, 갭분석 F13) */
export default function Banned() {
  useBlockBack();
  return (
    <Screen header={<Header title={t.header} left="none" reason={t.locked} right={<AccountMenu />} />}>
      <View style={{ flex: 1, justifyContent: 'center', gap: S.md, minHeight: 360 }}>
        <H1>{t.title}</H1>
        <Body>{t.body(GIVEUP_MAX_CONFIRMED)}</Body>
        <Body muted>{t.keep}</Body>
      </View>
    </Screen>
  );
}
