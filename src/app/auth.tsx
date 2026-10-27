import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Checkbox } from '@/components/Checkbox';
import { Header } from '@/components/Header';
import { useInk } from '@/components/surface';
import { TextButton } from '@/components/TextButton';
import { Body, Button, H1, Label, Screen, styles } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { MIN_AGE } from '@/lib/rules';
import { useApp } from '@/lib/store';
import { B, C, S, T } from '@/lib/theme';

// 이메일+비밀번호 로그인(가입 겸용). 이메일 인증은 없다(2026-10-27 오너 결정).
// 로그인이 끝나면 route.ts가 원래 화면(?next=)이나 홈으로 보낸다.

const t = copy.auth;
// supabase/config.toml minimum_password_length와 같게 둔다. 운영은 대시보드 값을 맞춘다
const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'email' | 'password';

function Input({ label, ...props }: TextInputProps & { label: string }) {
  const { p } = useInk();
  return (
    <View style={{ gap: S.xs }}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={p.sub}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={[styles.input, T.body, { borderColor: p.ink, backgroundColor: p.card, color: p.ink, minHeight: 52 }]}
      />
    </View>
  );
}

export default function Auth() {
  const store = useApp();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  // 이메일 칸을 벗어났거나 키보드 완료를 눌렀다. 그 전에는 형식이 틀려도 빨강을 띄우지 않는다(쓰는 중, U9 D7)
  const [emailDone, setEmailDone] = useState(false);
  const [password, setPassword] = useState('');
  // 가입인지 로그인인지는 제출해야 안다. 그래서 확인 칸을 늘 받는다. 가입 때 오타 난 비밀번호는 찾을 수 없다
  const [password2, setPassword2] = useState('');
  const [consent, setConsent] = useState({ age: false, terms: false, ai: false });
  const [showTransfer, setShowTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      const err = toApiError(e);
      setError(errorText(err.kind, err.code));
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = () => {
    setError(null);
    setStep('password');
  };
  const submitPassword = () => run(() => store.signUpOrIn(email, password));

  const backToEmail = () => {
    setStep('email');
    setError(null);
  };

  // 비밀번호 단계에서 Android 뒤로는 헤더 chevron과 같이 이메일 단계로 간다(갭분석 N5, MP 7.7-2 "앞 화면으로")
  useEffect(() => {
    if (step === 'email') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('email');
      setError(null);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  // 가입 화면에서 여는 약관은 아래에서 올라오는 모달로 보고 X로 닫는다(갭분석 N2)
  const legal = (doc: 'terms' | 'privacy') => router.push(`/settings/legal/${doc}?modal=1`);

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (step === 'email') {
    const allAgreed = consent.age && consent.terms && consent.ai;
    // 빈 입력은 이유 없이 비활성. 쓴 이메일이 틀리거나 동의가 빠졌을 때만 빨강 이유를 보인다(3절 빨강 안내).
    // 형식 오류는 칸을 벗어난 뒤에만 보인다. 첫 글자부터 빨강이면 다 쓰기도 전에 틀렸다고 말하는 셈이다
    const typed = email.trim().length > 0;
    const badEmail = !EMAIL_RE.test(email.trim());
    const reason = !typed ? null : badEmail ? (emailDone ? t.badEmail : null) : !allAgreed ? t.needConsent : null;
    body = (
      <>
        <H1>{t.title}</H1>
        <Body muted>{t.sub}</Body>
        <Input
          label={t.emailLabel}
          value={email}
          onChangeText={setEmail}
          placeholder={t.emailPlaceholder}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="done"
          onBlur={() => setEmailDone(true)}
          onSubmitEditing={() => setEmailDone(true)}
        />
        <View style={{ gap: S.xs }}>
          {/* 모두 동의(갭분석 V9). 아래 3개를 한 번에 체크하고 푼다. 3개가 모두 체크되면 같이 체크된다 */}
          <Checkbox label={t.agreeAll} checked={allAgreed} onChange={(v) => setConsent({ age: v, terms: v, ai: v })} />
          <View style={{ gap: S.xs, paddingLeft: S.lg }}>
            <Checkbox label={t.required(t.age(MIN_AGE))} checked={consent.age} onChange={(age) => setConsent({ ...consent, age })} />
            <Checkbox label={t.required(t.terms)} checked={consent.terms} onChange={(terms) => setConsent({ ...consent, terms })} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: S.sm }}>
              <TextButton title={t.viewTerms} tone="sub" link onPress={() => legal('terms')} />
              <TextButton title={t.viewPrivacy} tone="sub" link onPress={() => legal('privacy')} />
            </View>
            <Checkbox label={t.required(t.ai)} checked={consent.ai} onChange={(ai) => setConsent({ ...consent, ai })} />
            {/* 국외 이전 동의에 알릴 다섯 가지(받는 자, 국가, 항목, 시기와 방법, 목적과 보유 기간). 처리방침 7절과 같다 */}
            <TextButton
              title={showTransfer ? t.hideTransfer : t.viewTransfer}
              tone="sub"
              link
              onPress={() => setShowTransfer(!showTransfer)}
              style={{ alignSelf: 'flex-end' }}
            />
            {showTransfer ? (
              <View style={{ gap: S.sm, borderTopWidth: B.hair, borderColor: C.line, paddingTop: S.sm }}>
                {t.transferRows.map(([k, v]) => (
                  <View key={k} style={{ gap: 2 }}>
                    <Label>{k}</Label>
                    <Text style={[T.small, { color: C.ink }]}>{v}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </>
    );
    footer = <Button title={t.next} onPress={submitEmail} disabled={!typed || badEmail || !!reason} disabledReason={reason} />;
  } else {
    const short = password.length < PASSWORD_MIN;
    const mismatch = password !== password2;
    body = (
      <>
        <H1>{t.passwordTitle}</H1>
        <Body muted>{email.trim()}</Body>
        <Body muted>{t.passwordSub}</Body>
        <Input
          label={t.passwordLabel}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="password"
          autoFocus
        />
        <Input
          label={t.password2Label}
          value={password2}
          onChangeText={setPassword2}
          secureTextEntry
          textContentType="password"
          autoComplete="password"
          onSubmitEditing={() => !short && !mismatch && void submitPassword()}
        />
      </>
    );
    // 빈 칸은 이유 없이 비활성. 쓰기 시작했는데 모자라거나 두 칸이 다르면 빨강
    footer = (
      <Button
        title={t.verify}
        onPress={() => void submitPassword()}
        busy={busy}
        disabled={short || mismatch}
        disabledReason={password.length > 0 && short ? t.passwordShort(PASSWORD_MIN) : password2.length > 0 && mismatch ? t.passwordMismatch : null}
      />
    );
  }

  return (
    <Screen footer={footer} header={step === 'email' ? undefined : <Header title={t.header} onLeft={backToEmail} />}>
      {body}
      {error ? <Text accessibilityRole="alert" style={[T.small, { color: C.redText }]}>{error}</Text> : null}
    </Screen>
  );
}
