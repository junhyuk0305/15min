import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { LegalText } from '@/components/LegalText';
import { showToast } from '@/components/Toast';
import { Screen } from '@/components/ui';
import { copy } from '@/lib/copy';

const DOCS = { terms: copy.legal.terms, privacy: copy.legal.privacy } as const;

/**
 * 이용약관, 개인정보처리방침 원문. 로그인 전과 이용 정지 중에도 열린다.
 * 가입 화면에서 열면(?modal=1) 아래에서 올라오는 모달로 보고 헤더 X로 닫는다. 그 밖에는 헤더 chevron(갭분석 N2).
 */
export default function LegalDoc() {
  const { doc, modal } = useLocalSearchParams<{ doc: string; modal?: string }>();
  const source = doc === 'terms' || doc === 'privacy' ? DOCS[doc] : null;

  useEffect(() => {
    if (source) return;
    showToast(copy.status.notFound);
    router.replace('/');
  }, [source]);

  if (!source) return null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Screen header={<Header title={copy.legal.titles[doc]} left={modal === '1' ? 'close' : 'back'} onLeft={back} />}>
      <LegalText source={source} />
    </Screen>
  );
}
