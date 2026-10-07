import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { BotPicker, EMPTY_DRAFT, GoalFields, ScheduleFields, goalPartValid, type GoalDraft } from '@/components/GoalForm';
import { Body, Button, H1, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { openSystemSettings, requestPermission } from '@/lib/notify';
import { useRuntime } from '@/lib/runtime';
import { useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

const STEPS = 7;
const o = copy.onboarding;

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<GoalDraft>(EMPTY_DRAFT);
  const [denied, setDenied] = useState(false);
  const createGoal = useApp((s) => s.createGoal);
  const setPermission = useRuntime((s) => s.setPermission);

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));

  const agree = async () => {
    const p = await requestPermission();
    setPermission(p);
    if (p !== 'granted') {
      setDenied(true);
      return;
    }
    createGoal(draft);
    router.replace('/');
  };

  const dots = (
    <View style={{ flexDirection: 'row', gap: S.xs }}>
      {Array.from({ length: STEPS }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? C.ink : C.line }} />
      ))}
    </View>
  );

  let content: React.ReactNode = null;
  let footer: React.ReactNode = <Button title={o.next} onPress={next} />;

  if (step === 0) {
    content = (
      <View style={{ gap: S.lg }}>
        <Text style={T.hero}>{o.hookTitle}</Text>
        <View style={{ gap: S.sm }}>
          {o.hookRows.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: C.line, paddingVertical: S.sm }}>
              <Text style={T.h2}>{k}</Text>
              <Text style={[T.big, { fontSize: 32 }]}>{v}</Text>
            </View>
          ))}
        </View>
        <Body>{o.hookBody}</Body>
      </View>
    );
  } else if (step === 1) {
    content = (
      <View style={{ gap: S.md }}>
        <Text style={[T.h1, { fontSize: 36, lineHeight: 46 }]}>{o.problem}</Text>
        <Body muted>{o.problemSub}</Body>
      </View>
    );
  } else if (step === 2) {
    content = (
      <View style={{ gap: S.md }}>
        <Text style={[T.h1, { fontSize: 36, lineHeight: 46 }]}>{o.promise}</Text>
        <Body muted>{o.promiseSub}</Body>
      </View>
    );
  } else if (step === 3) {
    content = (
      <View style={{ gap: S.lg }}>
        <H1>{o.goalTitle}</H1>
        <GoalFields draft={draft} onChange={setDraft} />
      </View>
    );
    footer = <Button title={o.next} onPress={next} disabled={!goalPartValid(draft)} />;
  } else if (step === 4) {
    content = (
      <View style={{ gap: S.lg }}>
        <H1>{o.scheduleTitle}</H1>
        <ScheduleFields
          startMinutes={draft.startMinutes}
          targetMinutes={draft.targetMinutes}
          onChange={(v) => setDraft({ ...draft, ...v })}
        />
        <Body muted>{o.scheduleNote}</Body>
        <BotPicker value={draft.botId} onChange={(botId) => setDraft({ ...draft, botId })} />
      </View>
    );
  } else if (step === 5) {
    content = (
      <View style={{ gap: S.lg }}>
        <H1>{o.methodTitle}</H1>
        <View style={{ gap: S.sm }}>
          <View style={{ alignSelf: 'flex-start', maxWidth: '85%', backgroundColor: C.card, borderRadius: 14, padding: S.md, borderWidth: 1, borderColor: C.line }}>
            <Body>Task: Your client delayed a payment. Write a polite but firm email.</Body>
          </View>
          <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: C.ink, borderRadius: 14, padding: S.md }}>
            <Text style={[T.body, { color: C.card }]}>Dear Mr. Lee, I am writing to follow up on the invoice dated…</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Label>86/100</Label>
          </View>
        </View>
        <Body muted>{o.methodSub}</Body>
      </View>
    );
  } else {
    content = (
      <View style={{ gap: S.lg }}>
        <Text style={[T.h1, { color: C.redInk, fontSize: 36, lineHeight: 46 }]}>{o.warnTitle}</Text>
        <Text style={[T.h2, { color: C.redInk }]}>{o.warnBody}</Text>
        <Body inverse>{o.warnCoupon}</Body>
        {denied ? <Body inverse>{o.permissionDenied}</Body> : null}
      </View>
    );
    footer = (
      <>
        <Button title={o.warnAgree} kind="inverse" onPress={agree} />
        {denied ? <Button title={o.openSettings} kind="inverse" onPress={openSystemSettings} /> : null}
      </>
    );
  }

  return (
    <Screen danger={step === 6} footer={footer}>
      {step < 6 ? dots : null}
      {step > 0 && step < 6 ? (
        <Text accessibilityRole="button" onPress={() => setStep(step - 1)} style={[T.small, { color: C.sub }]}>
          {o.prev}
        </Text>
      ) : null}
      <View style={{ flex: 1, justifyContent: step < 3 ? 'center' : 'flex-start', minHeight: 360 }}>{content}</View>
    </Screen>
  );
}
