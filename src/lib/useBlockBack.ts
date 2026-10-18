import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/** 강제 화면(반성문, 영구 정지 안내)에서 Android 뒤로 가기를 막는다 (MP 7.7-2) */
export function useBlockBack() {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );
}
