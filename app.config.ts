import { ExpoConfig, ConfigContext } from 'expo/config';

// 정적 설정의 정본은 app.json이다. eas init과 eas update:configure는 app.json에 쓴다.
// 여기서는 eas init이 app.json에 넣은 projectId로 EAS Update 주소만 만든다.
export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId: string | undefined = config.extra?.eas?.projectId;
  return {
    ...(config as ExpoConfig),
    ...(projectId ? { updates: { ...config.updates, url: `https://u.expo.dev/${projectId}` } } : {}),
  };
};
