// 개발 전용 부품 확인 화면(U2). __DEV__가 아니면 홈으로 돌려보낸다. 문구는 copy.ts 것을 빌려 쓰고 설명은 영어로 둔다.
// ?show=sheet|action|confirm|toast|coach 로 덮는 부품을 바로 띄운다(스크린샷용).
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { ActionSheet, BottomSheet, ConfirmSheet } from '@/components/BottomSheet';
import { Coachmark } from '@/components/Coachmark';
import { Composer } from '@/components/Composer';
import { Header, HeaderMore } from '@/components/Header';
import { Skeleton } from '@/components/Skeleton';
import { SurfaceProvider } from '@/components/surface';
import { TextButton } from '@/components/TextButton';
import { showToast, ToastHost } from '@/components/Toast';
import { TypingDots } from '@/components/TypingDots';
import { Body, Button, Card, Field, Gauge, Label, Row, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { PALETTES, S, T } from '@/lib/theme';

export default function Gallery() {
  if (!__DEV__) return <Redirect href="/" />;
  return <GalleryBody />;
}

function GalleryBody() {
  const { show, only } = useLocalSearchParams<{ show?: string; only?: string }>();
  const [open, setOpen] = useState<string | null>(show ?? null);
  const [text, setText] = useState('');
  const [ratio, setRatio] = useState(0.3);
  const target1 = useRef<View>(null);
  const target2 = useRef<View>(null);
  useEffect(() => {
    if (show === 'toast') showToast(copy.report.done);
  }, [show]);
  const close = () => setOpen(null);
  const part = (name: string) => !only || only === name;

  return (
    <Screen>
      {part('header') ? (
        <View style={{ gap: S.sm }}>
          <Label>Header</Label>
          <Header title={copy.settings.logout} onLeft={() => router.back()} right={<HeaderMore onPress={() => setOpen('action')} />} scrolled />
          <Header title={copy.legal.titles.terms} left="close" onLeft={() => router.back()} />
          <Header title={copy.goalSetup.title} left="none" reason={copy.ux.typing} />
          <SurfaceProvider red>
            <View style={{ backgroundColor: PALETTES.ivory.red, borderRadius: 12 }}>
              <Header title={copy.settings.logout} onLeft={() => router.back()} scrolled />
            </View>
          </SurfaceProvider>
        </View>
      ) : null}

      {part('controls') ? (
        <View style={{ gap: S.sm }}>
          <Label>Button / Row / Field / Gauge</Label>
          <Button title={copy.ux.next} onPress={() => setRatio(ratio >= 1 ? 0 : ratio + 0.35)} />
          <Button title={copy.ux.send} onPress={() => undefined} disabled disabledReason={copy.learn.pickChoice} />
          <Gauge ratio={ratio} />
          <Card onPress={() => setOpen('sheet')}>
            <Body>{copy.learn.inputPlaceholder}</Body>
          </Card>
          <View ref={target1} collapsable={false}>
            <Row left={copy.settings.logout} value={copy.legal.titles.privacy} chevron pressBg onPress={() => setOpen('confirm')} />
          </View>
          <Row left={copy.legal.titles.terms} right="1.0.0" />
          <Field label="min 20" value={text} onChange={setText} min={20} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: S.md }}>
            <TextButton title={copy.ux.more} arrow onPress={() => setOpen('coach')} />
            <TextButton title={copy.legal.titles.terms} link onPress={() => showToast(copy.report.done)} />
          </View>
        </View>
      ) : null}

      {part('skeleton') ? (
        <View ref={target2} collapsable={false} style={{ gap: S.sm }} accessibilityLabel={copy.status.loading}>
          <Label>Skeleton / TypingDots</Label>
          <Skeleton width="60%" height={20} />
          <Skeleton height={14} />
          <Skeleton width="80%" height={14} />
          <TypingDots />
        </View>
      ) : null}

      {part('composer') ? (
        <View style={{ gap: S.md }}>
          <Label>Composer</Label>
          <Composer value="" onChange={() => undefined} onSend={() => undefined} placeholder={copy.learn.inputPlaceholder} />
          <Composer value={text || 'I would like an iced latte, please.'} onChange={setText} onSend={() => undefined} placeholder={copy.learn.inputPlaceholder} />
          <Composer value="Hello" onChange={() => undefined} onSend={() => undefined} min={20} placeholder={copy.learn.inputPlaceholder} />
          <Composer value="" onChange={() => undefined} onSend={() => undefined} min={20} placeholder={copy.learn.inputPlaceholder} />
          <Composer
            value="I would like an iced latte, please."
            onChange={() => undefined}
            onSend={() => undefined}
            error={copy.learn.failed}
            placeholder={copy.learn.inputPlaceholder}
          />
          <SurfaceProvider theme="dark">
            <View style={{ backgroundColor: PALETTES.dark.bg, padding: S.md, borderRadius: 12, gap: S.md }}>
              <Text style={[T.small, { color: PALETTES.dark.sub }]}>dark</Text>
              <TypingDots />
              <Composer value="" onChange={() => undefined} onSend={() => undefined} placeholder={copy.learn.inputPlaceholder} />
              <Composer value="Hi" onChange={() => undefined} onSend={() => undefined} min={20} placeholder={copy.learn.inputPlaceholder} />
            </View>
          </SurfaceProvider>
        </View>
      ) : null}

      <BottomSheet visible={open === 'sheet'} onClose={close}>
        <Body>{copy.learn.idleBody}</Body>
        <Button title={copy.ux.close} onPress={close} />
      </BottomSheet>
      <ActionSheet
        visible={open === 'action'}
        onClose={close}
        title={copy.report.label}
        actions={copy.report.reasons.map((r, i) => ({ label: r, onPress: close, danger: i === 0 }))}
      />
      <ConfirmSheet
        visible={open === 'confirm'}
        onClose={close}
        title={copy.settings.logout}
        body={copy.learn.idleBody}
        primary={copy.ux.close}
        onPrimary={close}
        secondary={copy.settings.logout}
        onSecondary={close}
        danger
      />
      <Coachmark
        visible={open === 'coach'}
        onDone={close}
        steps={[
          { target: target1, text: copy.learn.idleBody },
          { target: target2, text: copy.status.loading },
        ]}
      />
      <ToastHost />
    </Screen>
  );
}
