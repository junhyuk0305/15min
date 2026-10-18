import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Checkbox } from '@/components/Checkbox';
import { CodeInput } from '@/components/CodeInput';
import { Header } from '@/components/Header';
import { useInk } from '@/components/surface';
import { TextButton } from '@/components/TextButton';
import { Body, Button, H1, Label, Screen, styles, useNow } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { MIN_AGE } from '@/lib/rules';
import { useApp } from '@/lib/store';
import { B, C, S, T } from '@/lib/theme';

// 이메일 6자리 코드 로그인(가입 겸용). 심사용 데모 이메일은 비밀번호 입력으로 바뀐다(MP P2-4).
// 로그인이 끝나면 route.ts가 원래 화면(?next=)이나 홈으로 보낸다.

const t = copy.auth;
const CODE_LENGTH = 6;
const RESEND_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'email' | 'code' | 'password';

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
  const now = useNow(1000, Date.now);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  // 이메일 칸을 벗어났거나 키보드 완료를 눌렀다. 그 전에는 형식이 틀려도 빨강을 띄우지 않는다(쓰는 중, U9 D7)
  const [emailDone, setEmailDone] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState({ age: false, terms: false, ai: false });
  const [showTransfer, setShowTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);

  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await job();
    } catch (e) {
      const err = toApiError(e);
      setError(errorText(err.kind, err.code));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    await store.sendCode(email);
    setResendAt(Date.now() + RESEND_MS);
    setCode('');
  };

  const submitEmail = () =>
    run(async () => {
      const method = await store.loginMethod(email);
      if (method === 'password') {
        setStep('password');
        return;
      }
      await sendCode();
      setStep('code');
    });

  const resend = () =>
    run(async () => {
      await sendCode();
      setInfo(t.resent);
    });

  // 6자리가 차면 바로 보낸다(갭분석 V10). 버튼도 같은 일을 한다.
  // 코드가 틀리면 칸을 비운다. 틀린 6자리가 남으면 같은 값을 다시 넣어도 바뀐 것이 없어 자동 제출이 안 된다
  const verify = (c = code) =>
    run(async () => {
      try {
        await store.verifyCode(email, c);
      } catch (e) {
        if (toApiError(e).code === 'otp_expired') setCode('');
        throw e;
      }
    });
  const passwordLogin = () => run(() => store.signInWithPassword(email, password));

  const backToEmail = () => {
    setStep('email');
    setError(null);
    setInfo(null);
  };

  // 코드, 비밀번호 단계에서 Android 뒤로는 헤더 chevron과 같이 이메일 단계로 간다(갭분석 N5, MP 7.7-2 "앞 화면으로")
  useEffect(() => {
    if (step === 'email') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('email');
      setError(null);
      setInfo(null);
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
    footer = <Button title={t.sendCode} onPress={submitEmail} busy={busy} disabled={!typed || badEmail || !!reason} disabledReason={reason} />;
  } else if (step === 'code') {
    const left = CODE_LENGTH - code.length;
    const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
    body = (
      <>
        <H1>{t.codeTitle}</H1>
        <Body muted>{t.codeSent(email.trim())}</Body>
        <View style={{ gap: S.xs }}>
          <Label>{t.codeLabel}</Label>
          <CodeInput value={code} onChange={setCode} onFull={(c) => void verify(c)} length={CODE_LENGTH} label={t.codeLabel} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
          {wait > 0 ? (
            <Text style={[T.small, { color: C.sub }]}>{t.resendIn(wait)}</Text>
          ) : (
            <TextButton title={t.resend} onPress={resend} disabled={busy} />
          )}
        </View>
      </>
    );
    // 빈 코드는 이유 없이 비활성. 쓰기 시작했는데 모자라면 빨강
    footer = (
      <Button title={t.verify} onPress={() => void verify()} busy={busy} disabled={left > 0} disabledReason={code.length > 0 && left > 0 ? t.codeLeft(left) : null} />
    );
  } else {
    body = (
      <>
        <H1>{t.passwordTitle}</H1>
        <Body muted>{email.trim()}</Body>
        <Input
          label={t.passwordLabel}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="password"
          autoFocus
        />
      </>
    );
    footer = <Button title={t.verify} onPress={passwordLogin} busy={busy} disabled={!password} />;
  }

  return (
    <Screen footer={footer} header={step === 'email' ? undefined : <Header title={t.header} onLeft={backToEmail} />}>
      {body}
      {error ? <Text accessibilityRole="alert" style={[T.small, { color: C.redText }]}>{error}</Text> : null}
      {info ? <Text style={[T.small, { color: C.sub }]}>{info}</Text> : null}
    </Screen>
  );
}
