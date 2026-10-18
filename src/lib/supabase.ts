// Supabase 클라이언트와 앱 전역 api. 앱 번들에는 URL과 anon key만 들어간다(MP 4절).
// 환경변수가 없으면 클라이언트를 만들지 않는다. _layout이 configMissing을 보고 설정 오류 화면을 띄운다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { createApi } from './api';
import { authStorage } from './authStorage';

// EXPO_PUBLIC_*은 process.env.EXPO_PUBLIC_X 그대로 써야 번들에 들어간다
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const configMissing = !url || !anonKey;

export const supabase: SupabaseClient | null = configMissing
  ? null
  : createClient(url as string, anonKey as string, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });

// 네이티브는 앱이 앞에 있을 때만 토큰을 자동 갱신한다. 웹은 브라우저 탭 상태로 supabase-js가 직접 관리한다.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

let authLost: () => void = () => undefined;

/** 세션 갱신까지 실패했을 때 부를 함수. store가 등록한다 */
export function onAuthLost(fn: () => void) {
  authLost = fn;
}

export const api = createApi({ client: () => supabase, onAuthLost: () => authLost() });
