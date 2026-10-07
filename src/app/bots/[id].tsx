import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, Field, H1, Screen, Stepper } from '@/components/ui';
import { DEFAULT_MIN_CHARS, type Bot } from '@/lib/bots';
import { copy } from '@/lib/copy';
import { useApp } from '@/lib/store';

const t = copy.bots;

export default function BotEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useApp((s) => s.customBots.find((b) => b.id === id));
  const saveBot = useApp((s) => s.saveBot);
  const removeBot = useApp((s) => s.removeBot);
  const [bot, setBot] = useState<Bot>(
    existing ?? { id: '', name: '', role: '', opening: '', minChars: DEFAULT_MIN_CHARS, builtin: false },
  );
  const valid = bot.name.trim() && bot.role.trim() && bot.opening.trim();

  return (
    <Screen
      footer={
        <>
          <Button
            title={t.save}
            disabled={!valid}
            onPress={() => {
              saveBot(bot);
              router.back();
            }}
          />
          {existing ? (
            <Button
              title={t.remove}
              kind="secondary"
              onPress={() => {
                removeBot(existing.id);
                router.back();
              }}
            />
          ) : null}
        </>
      }
    >
      <H1>{existing ? existing.name : t.add}</H1>
      <Field label={t.name} value={bot.name} onChange={(name) => setBot({ ...bot, name })} />
      <Field label={t.role} value={bot.role} onChange={(role) => setBot({ ...bot, role })} placeholder={t.rolePlaceholder} multiline />
      <Field label={t.opening} value={bot.opening} onChange={(opening) => setBot({ ...bot, opening })} placeholder={t.openingPlaceholder} multiline />
      <Stepper
        label={t.min}
        display={`${bot.minChars}자`}
        minusLabel="−10"
        plusLabel="+10"
        onMinus={() => setBot({ ...bot, minChars: Math.max(20, bot.minChars - 10) })}
        onPlus={() => setBot({ ...bot, minChars: Math.min(500, bot.minChars + 10) })}
      />
    </Screen>
  );
}
