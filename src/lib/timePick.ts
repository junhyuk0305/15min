// 시스템 시각 선택기와 분 숫자(0~1439, 한국 시간) 사이 변환. 선택기에는 timeZoneName=APP_TIME_ZONE을 같이 넘긴다.
// 기기 시간대를 쓰지 않으므로 해외 기기에서도 시각이 밀리지 않는다. React Native를 import하지 않는다(Node 테스트용).
import { APP_TIME_ZONE, localParts, zonedTime } from './rules';

/** 선택기에 넘길 날짜. 날짜 부분은 쓰지 않으니 아무 날이나 고정한다 */
const ANY_DAY = '2000-01-03';

/** 분 숫자를 그 한국 시각의 Date로 */
export function minutesToPickerDate(minutes: number): Date {
  return new Date(zonedTime(ANY_DAY, minutes, APP_TIME_ZONE));
}

/** 선택기가 돌려준 Date를 한국 시각의 분 숫자로. 초는 버린다 */
export function pickerDateToMinutes(date: Date): number {
  const p = localParts(date.getTime(), APP_TIME_ZONE);
  return p.hour * 60 + p.minute;
}
