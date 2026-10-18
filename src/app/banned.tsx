import { View } from 'react-native';
import { DeleteAccountButton, LegalLinks } from '@/components/AccountLinks';
import { Body, H1, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { GIVEUP_MAX_CONFIRMED } from '@/lib/rules';
import { useBlockBack } from '@/lib/useBlockBack';
import { S } from '@/lib/theme';

const t = copy.banned;

/** 영구 정지 안내. 나가는 길 대신 계정 삭제와 약관만 둔다 (기획서 8.4, 결정로그) */
export default function Banned() {
  useBlockBack();
  return (
    <Screen
      footer={
        <>
          <DeleteAccountButton />
          <LegalLinks />
        </>
      }
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: S.md, minHeight: 360 }}>
        <H1>{t.title}</H1>
        <Body>{t.body(GIVEUP_MAX_CONFIRMED)}</Body>
        <Body muted>{t.keep}</Body>
      </View>
    </Screen>
  );
}
