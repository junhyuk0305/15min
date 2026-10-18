import { View } from 'react-native';
import { Body, Button, H1, Screen } from '@/components/ui';

/** 앱 전체를 막는 오류 화면 (설정 없음, 첫 읽기 실패, 렌더 오류). 할 일 하나를 분명히 보인다 */
export function ErrorScreen({
  title,
  body,
  action,
  onAction,
  busy,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
  busy?: boolean;
}) {
  return (
    <Screen footer={action && onAction ? <Button title={action} onPress={onAction} busy={busy} /> : undefined}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 16, minHeight: 360 }}>
        <H1>{title}</H1>
        <Body muted>{body}</Body>
      </View>
    </Screen>
  );
}
