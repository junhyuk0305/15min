package expo.modules.exactalarm

import android.app.AlarmManager
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// SCHEDULE_EXACT_ALARM 권한 상태를 읽는다. Expo JS API에는 이 값을 읽는 함수가 없다.
// expo-notifications는 권한이 없으면 오류 없이 부정확한 알람으로 바꿔 건다(ExpoSchedulingDelegate).
class ExactAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExactAlarm")

    // Android 12(API 31) 미만은 권한이 필요 없다. 시스템 서비스를 못 얻으면 null(알 수 없음).
    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return@Function true
      }
      val alarmManager = appContext.reactContext?.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
      alarmManager?.canScheduleExactAlarms()
    }
  }
}
