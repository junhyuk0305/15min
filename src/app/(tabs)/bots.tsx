import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Card, H1, Label, Screen } from '@/components/ui';
import { BUILTIN_BOTS } from '@/lib/bots';
import { copy } from '@/lib/copy';
import { useApp } from '@/lib/store';
import { S, T } from '@/lib/theme';

const t = copy.bots;

export default function Bots() {
  const custom = useApp((s) => s.customBots);
  return (
    <Screen footer={<Button title={t.add} onPress={() => router.push('/bots/new')} />}>
      <H1>{t.title}</H1>
      <Label>{t.builtin}</Label>
      {BUILTIN_BOTS.map((b) => (
        <Card key={b.id}>
          <Text style={T.h2}>{b.name}</Text>
          <Text style={[T.small]}>{t.minChars(b.minChars)}</Text>
        </Card>
      ))}
      <View style={{ height: S.sm }} />
      <Label>{t.mine}</Label>
      {custom.length === 0 ? <Body muted>{t.mineEmpty}</Body> : null}
      {custom.map((b) => (
        <Card key={b.id} onPress={() => router.push(`/bots/${b.id}`)}>
          <Text style={T.h2}>{b.name}</Text>
          <Text style={T.small}>{t.minChars(b.minChars)}</Text>
        </Card>
      ))}
    </Screen>
  );
}
