import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { LegalText } from '@/components/LegalText';
import { Button, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { useRuntime } from '@/lib/runtime';

const DOCS = { terms: copy.legal.terms, privacy: copy.legal.privacy } as const;

/** 이용약관, 개인정보처리방침 원문. 로그인 전과 이용 정지 중에도 열린다 */
export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const source = doc === 'terms' || doc === 'privacy' ? DOCS[doc] : null;

  useEffect(() => {
    if (source) return;
    useRuntime.getState().setNotice(copy.status.notFound);
    router.replace('/');
  }, [source]);

  if (!source) return null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Screen footer={<Button title={copy.legal.back} kind="secondary" onPress={back} />}>
      <LegalText source={source} />
    </Screen>
  );
}
