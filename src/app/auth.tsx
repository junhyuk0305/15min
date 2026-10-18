import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { Checkbox } from '@/components/Checkbox';
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

  const verify = () => run(() => store.verifyCode(email, code));
  const passwordLogin = () => run(() => store.signInWithPassword(email, password));

  const backToEmail = () => {
    setStep('email');
    setError(null);
    setInfo(null);
  };

  const legal = (doc: 'terms' | 'privacy') => router.push(`/settings/legal/${doc}`);

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (step === 'email') {
    const allAgreed = consent.age && consent.terms && consent.ai;
    const reason = !email.trim() ? t.needEmail : !EMAIL_RE.test(email.trim()) ? t.badEmail : !allAgreed ? t.needConsent : null;
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
        />
        <View style={{ gap: S.xs }}>
          <Checkbox label={t.required(t.age(MIN_AGE))} checked={consent.age} onChange={(age) => setConsent({ ...consent, age })} />
          <Checkbox label={t.required(t.terms)} checked={consent.terms} onChange={(terms) => setConsent({ ...consent, terms })} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: S.sm }}>
            <TextButton title={t.viewTerms} tone="sub" onPress={() => legal('terms')} />
            <TextButton title={t.viewPrivacy} tone="sub" onPress={() => legal('privacy')} />
          </View>
          <Checkbox label={t.required(t.ai)} checked={consent.ai} onChange={(ai) => setConsent({ ...consent, ai })} />
          {/* 국외 이전 동의에 알릴 다섯 가지(받는 자, 국가, 항목, 시기와 방법, 목적과 보유 기간). 처리방침 7절과 같다 */}
          <TextButton
            title={showTransfer ? t.hideTransfer : t.viewTransfer}
            tone="sub"
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
      </>
    );
    footer = <Button title={t.sendCode} onPress={submitEmail} busy={busy} disabled={!!reason} disabledReason={reason} />;
  } else if (step === 'code') {
    const left = CODE_LENGTH - code.length;
    const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
    body = (
      <>
        <H1>{t.codeTitle}</H1>
        <Body muted>{t.codeSent(email.trim())}</Body>
        <Input
          label={t.codeLabel}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          autoFocus
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <TextButton title={t.changeEmail} tone="sub" onPress={backToEmail} disabled={busy} />
          {wait > 0 ? (
            <Text style={[T.small, { color: C.sub }]}>{t.resendIn(wait)}</Text>
          ) : (
            <TextButton title={t.resend} onPress={resend} disabled={busy} />
          )}
        </View>
      </>
    );
    footer = <Button title={t.verify} onPress={verify} busy={busy} disabled={left > 0} disabledReason={left > 0 ? t.codeLeft(left) : null} />;
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
        <TextButton title={t.changeEmail} tone="sub" onPress={backToEmail} disabled={busy} />
      </>
    );
    footer = (
      <Button title={t.verify} onPress={passwordLogin} busy={busy} disabled={!password} disabledReason={!password ? t.needPassword : null} />
    );
  }

  return (
    <Screen footer={footer}>
      {body}
      {error ? <Text accessibilityRole="alert" style={[T.small, { color: C.redText }]}>{error}</Text> : null}
      {info ? <Text style={[T.small, { color: C.sub }]}>{info}</Text> : null}
    </Screen>
  );
}
