# Expo SDK 57 implementation notes (yourtime / 그래고)

Researched 2026-10-18. Project: expo ~57.0.30, expo-router ~57.0.28, react-native 0.86.3, react 19.2.3.
Sources are official docs fetched as Markdown (`.md` suffix on docs.expo.dev, supabase.com, docs.sentry.io).
Where docs and the installed package disagree, the installed `node_modules` type defs (v57.0.28) win, and that is marked **[pkg]**.

IMPORTANT: un-versioned Expo guide pages (`docs.expo.dev/router/...`, `/guides/...`) now describe **SDK 58**.
Several features there are marked "SDK 58 and later". Check the SDK note before copying.

## 0. Packages NOT installed yet (verified in node_modules)

`@supabase/supabase-js`, `expo-secure-store`, `expo-splash-screen`, `expo-updates`, `expo-web-browser`,
`expo-intent-launcher`, `expo-build-properties`, `expo-system-ui`, `expo-localization`, `expo-sqlite`,
`react-native-keyboard-controller`, `@sentry/react-native`, `@expo/vector-icons`.
Install every one with `npx expo install <pkg>` (AGENTS.md rule).
`expo-font` IS present (dependency of `expo`).

---

## 1. Supabase auth in Expo

### 1a. Client setup. Two official variants

**Expo's guide (current)** uses the expo-sqlite localStorage shim.
Source: https://docs.expo.dev/guides/using-supabase.md
```ts
// src/lib/supabase.ts
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
```
- Install: `npx expo install @supabase/supabase-js expo-sqlite`. Add the `expo-sqlite` config plugin.
- `detectSessionInUrl: false` because "Android and iOS have no URL to read a session from".
- `react-native-url-polyfill/auto` is NOT needed: "Expo installs a `URL` global already".
- `import 'expo-sqlite/localStorage/install'` "is a no-op on web and will be excluded from the production JS bundle", so the browser's real `localStorage` is used on web. Source: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite.md
- Env var names Expo/EAS integration writes: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Never ship a secret key. RLS on every table. A missing policy returns `[]` with no error. A missing GRANT fails with `error.code` `42501`.

**Supabase tutorial** uses AsyncStorage, or `LargeSecureStore` for encryption.
Source: https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native.md
- Plain variant: `npx expo install @supabase/supabase-js @react-native-async-storage/async-storage` (project already has async-storage 2.2.0, which supports web per https://docs.expo.dev/versions/v57.0.0/sdk/async-storage.md).
- Encrypted variant. Packages: `aes-js`, `react-native-get-random-values`, dev `@types/aes-js`, plus `expo-secure-store`.
  Comment in the official code: "As Expo's SecureStore does not support values larger than 2048 bytes, an AES-256 key is generated and stored in SecureStore, while it is used to encrypt/decrypt values stored in AsyncStorage."
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import 'react-native-get-random-values';
class LargeSecureStore {
  private async _encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }
  private async _decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return encryptionKeyHex;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
  }
  async getItem(key: string) { const e = await AsyncStorage.getItem(key); return e ? this._decrypt(key, e) : e; }
  async removeItem(key: string) { await AsyncStorage.removeItem(key); await SecureStore.deleteItemAsync(key); }
  async setItem(key: string, value: string) { await AsyncStorage.setItem(key, await this._encrypt(key, value)); }
}
// createClient(url, key, { auth: { storage: new LargeSecureStore(), autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
```
- **Gotcha: SecureStore has no web support** (platforms: Android, iOS, tvOS). LargeSecureStore breaks on web.
  On web pick plain AsyncStorage/localStorage via `Platform.OS === 'web'` or a `.web.ts` file.
- The v57 SecureStore page softens the limit: "Historically, some iOS releases refused values above roughly 2048 bytes. Expo does not enforce a limit". A Supabase session (JWT + refresh token + user JSON) can exceed 2 KB, so do not put the raw session in SecureStore. Use LargeSecureStore or AsyncStorage. (https://docs.expo.dev/versions/v57.0.0/sdk/securestore.md)
- Simplest option for this project: AsyncStorage (already installed, works on web). SecureStore encryption is optional per the tutorial ("If you wish to encrypt...").

### 1b. AppState auto-refresh
Source: https://supabase.com/docs/reference/javascript/auth-startautorefresh (via https://supabase.com/llms/js.txt) and the Expo guide.
```ts
import { AppState } from 'react-native';
// make sure you register this only once!  (official comment)
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```
- On non-browser platforms the loop runs "*continuously* in the background". Browsers manage it by tab focus. Calling start/stop "removes any managed visibility change callback", so on web skip this listener (`Platform.OS !== 'web'`).

### 1c. Email OTP
Source: https://supabase.com/docs/guides/auth/auth-email-passwordless.md, https://supabase.com/llms/js.txt
```ts
await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
const { data: { session }, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
```
- OTP vs magic link is decided by the **Magic Link email template**: include `{{ .Token }}` for a code, `{{ .ConfirmationURL }}` for a link. Dashboard: Authentication > Email Templates.
- Default: one request per 60 s per user. Codes expire after 1 hour (configurable, >86400 s discouraged).
- `signInWithOtp` signs up unknown users unless `shouldCreateUser: false`.
- verifyOtp email types: `email` (sign-in/sign-up), `recovery`, `invite`, `email_change`. `signup` and `magiclink` are deprecated.
- `options.data` (user metadata) **is documented for `signUp`** (`options: { data: { first_name } }`, stored in `raw_user_meta_data`, readable in triggers as `new.raw_user_meta_data->>'x'`, and in email templates as `{{ .Data }}`). Source: https://supabase.com/docs/guides/auth/managing-user-data.md
  For `signInWithOtp` the reference page lists only `credentials` with no sub-fields. **Not confirmed in docs.** Check `SignInWithPasswordlessCredentials` in `node_modules/@supabase/auth-js` after install before relying on it.
- Error message may not distinguish "no account" from "social-only account".

### 1d. Password sign-in
```ts
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
```
- New projects require email confirmation. `signUp` returns `data.session === null` until confirmed (Expo guide).

### 1e. Auth error shape
Source: https://supabase.com/docs/guides/auth/debugging/error-codes.md
- `AuthApiError` has `code` (string) and `status` (HTTP). Use `isAuthApiError(err)`, not `instanceof`.
- "Always use `error.code` and `error.name` to identify errors, not string matching on error messages."
- Useful codes: `otp_expired`, `over_email_send_rate_limit`, `invalid_credentials`, `email_not_confirmed`, `otp_disabled`, `signup_disabled`, `user_not_found`. HTTP 429 = rate limit.

### 1f. Edge Functions
Source: https://supabase.com/docs/guides/functions/error-handling.md, https://supabase.com/llms/js.txt (`invoke`)
```ts
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js';
const { data, error } = await supabase.functions.invoke('fn-name', { body: { foo: 'bar' } });
if (error instanceof FunctionsHttpError) {
  const payload = await error.context.json(); // function returned 4xx/5xx; context is the Response
} else if (error instanceof FunctionsRelayError) { /* network between client and Supabase */ }
else if (error instanceof FunctionsFetchError) { /* function unreachable */ }
```
- `invoke` sends the API key in `apikey`. `Authorization` carries the signed-in user's JWT. With no session, a new-format key (`sb_publishable_…`) is NOT sent as Bearer.
- Body: object → JSON with `Content-Type: application/json` automatically. Response parsed by `Content-Type` (json/blob/form-data), text by default.
- `method: 'GET' | 'DELETE' ...`, `headers`, `region` options exist.
- Prefer `invoke` over raw `fetch`: it attaches apikey + session JWT for you. With raw fetch you must set both headers yourself.
- Server side: `import { corsHeaders } from '@supabase/supabase-js/cors'` and answer `OPTIONS` (needed for web).

### 1g. RPC / PostgREST errors
Source: https://supabase.com/docs/guides/api/rest/postgrest-error-codes.md
```ts
const { data, error } = await supabase.rpc('fn', { arg: 1 });
// error: { code: string, message: string, details: string|null, hint: string|null }
```
- `P0001` (HTTP 400) = default for `raise exception` in plpgsql. Use `raise ... using errcode = '...'` or a message prefix if the client must branch.
- `42501` = insufficient privileges (403 if authenticated, else 401).
- `PGRST202` (404) = function not found / stale signature (schema cache). `PGRST116` (406) = `.single()` got 0 or >1 rows. `PGRST301` (401) = bad JWT.
- `supabase.rpc('fn', undefined, { get: true })` for read-only functions.

---

## 2. expo-secure-store v57
Source: https://docs.expo.dev/versions/v57.0.0/sdk/securestore.md
- Platforms: Android, iOS, tvOS. **No web.** Included in Expo Go.
- `import * as SecureStore from 'expo-secure-store';`
- `setItemAsync(key, value, options?)`, `getItemAsync(key, options?)` → `string | null`, `deleteItemAsync(key, options?)`, sync `getItem`/`setItem`, `isAvailableAsync()`, `canUseBiometricAuthentication()`.
- **Keys may contain only alphanumeric characters, `.`, `-`, `_`.** (Supabase's default key `sb-<ref>-auth-token` fits.)
- Options: `keychainAccessible` (iOS, default `WHEN_UNLOCKED`), `keychainService`, `requireAuthentication`, `authenticationPrompt`, `accessGroup`.
- Size: no Expo-enforced limit, "some iOS releases refused values above roughly 2048 bytes". Handle native errors.
- iOS keychain data may survive uninstall/reinstall. Android data does not.
- Config plugin: `["expo-secure-store", { "configureAndroidBackup": true, "faceIDPermission": "..." }]`. The plugin auto-excludes its prefs from Android Auto Backup.
- Doc suggests `ios.config.usesNonExemptEncryption: false` when using it.

---

## 3. expo-splash-screen v57 + expo-router
Source: https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen.md, https://docs.expo.dev/router/advanced/authentication.md
- Must install `expo-splash-screen`. **[pkg]** `SplashScreen` from `expo-router` calls `requireOptionalNativeModule('ExpoSplashScreen')` and silently no-ops if the module is missing (`node_modules/expo-router/build/utils/splash.js`). It is marked `@hidden` in exports.
- Methods: `preventAutoHideAsync(): Promise<boolean>`, `hide(): void`, `hideAsync()` (back-compat), `setOptions({ duration?: number /*400*/, fade?: boolean /*iOS only*/ })`.
- "call this in global scope without awaiting, rather than inside React components or hooks".
```tsx
// src/app/_layout.tsx
import * as SplashScreen from 'expo-splash-screen';
SplashScreen.preventAutoHideAsync();          // module scope
export default function RootLayout() {
  const ready = useAuthAndStateReady();
  useEffect(() => { if (ready) SplashScreen.hide(); }, [ready]);
  if (!ready) return null;                    // official example returns null until ready
  return <Stack />;
}
```
- Auth guide pattern: a `SplashScreenController` component inside the session provider that calls `SplashScreen.hide()` when `!isLoading` (imports `SplashScreen` from `expo-router`).
- **[pkg]** expo-router installs a global error handler that hides the splash on uncaught errors, so a crash does not leave the splash stuck.
- Config via plugin (recommended; other methods legacy): `["expo-splash-screen", { "backgroundColor": "#...", "image": "./assets/splash-icon.png", "imageWidth": 200, "dark": {...}, "resizeMode": "contain" }]`.
- Expo Go and dev builds cannot fully replicate the Android 12+ splash. Test in a release build.
- Web: not a native splash. `hide()` is listed for Android/iOS/tvOS only.

---

## 4. expo-router v57

### Unmatched routes
Source: https://docs.expo.dev/router/error-handling.md
```tsx
// src/app/+not-found.tsx
import { Unmatched } from 'expo-router';
export default Unmatched;   // or any component; include a Link to "/"
```
- Unknown deep links land on `+not-found`. On web it is served with HTTP 404 (static/server output).
- To rewrite odd incoming native URLs, add `src/app/+native-intent.tsx` exporting `redirectSystemPath({ path, initial })` that returns a path. It must never throw. It is native-only and has no auth context. Source: https://docs.expo.dev/router/advanced/native-intent.md

### ErrorBoundary
```tsx
import { type ErrorBoundaryProps } from 'expo-router';
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) { /* fallback UI; retry(): Promise<void> */ }
// or re-export the default:  export { ErrorBoundary } from 'expo-router';
```
- Without a route export, the error goes to the nearest parent's `ErrorBoundary`. Export one from `src/app/_layout.tsx` for a root catch-all.
- **[pkg] v57:** navigator prop `unstable_screenErrorBoundary={Comp}` exists on Stack/Tabs/Drawer (keeps header/tab bar mounted). `unstable_settings.screenErrorBoundary` from the latest guide was **not found** in v57.0.28 types.

### Redirects / guards
Source: https://docs.expo.dev/router/reference/redirects.md, https://docs.expo.dev/router/advanced/protected.md
- `<Redirect href="/login" />` from `expo-router`. Imperative: `router.replace('/x')` (`import { router } from 'expo-router'`) or `useRouter().replace`.
- **`Stack.Protected guard={bool}` and `Tabs.Protected` exist in v57** **[pkg]** (`ProtectedProps = { guard: boolean; children? }`).
  Denied access redirects to the anchor route or first available screen. Flipping a guard true→false removes that screen's history.
- **`redirectTo` prop is SDK 58+.** Not in v57 types.
- A screen may be declared only once across Protected groups.
- Protected routes are client-side only. Not a security boundary (RLS is).

### Typed routes
Source: https://docs.expo.dev/router/reference/typed-routes.md
- `app.json` → `"experiments": { "typedRoutes": true }`. Types are generated when `npx expo start` runs (untracked, added to .gitignore).
- For CI `tsc --noEmit` without a dev server: run `npx expo customize tsconfig.json` (docs' instruction).
- Dynamic routes need object hrefs: `{ pathname: '/user/[id]', params: { id } }`. Escape hatch: `as Href`.

### Preventing back
- **[pkg] v57:** `usePreventRemove(prevent: boolean, cb: ({ data: { action } }) => void)` is exported from **`expo-router/react-navigation`** (not `expo-router`; that move is SDK 58). In SDK 56+ app code must not import `@react-navigation/*` ("Expo Router no longer supports importing from external `@react-navigation/*` packages"). Source: https://docs.expo.dev/router/migrate/sdk-55-to-56.md
- `usePreventRemove` only blocks removal of a screen from a navigator. On a root screen, Android back exits the app. Use RN core:
```ts
import { BackHandler } from 'react-native';
useFocusEffect(useCallback(() => {
  const sub = BackHandler.addEventListener('hardwareBackPress', () => true); // true = consumed
  return () => sub.remove();
}, []));
```
  Android-only. Not fired while a `Modal` is open (use `onRequestClose`). Source: https://reactnative.dev/docs/backhandler
- app.json already has `android.predictiveBackGestureEnabled: false` (default false) (https://docs.expo.dev/versions/v57.0.0/config/app.md).

### Tabs and icons
- **[pkg] v57:** `export { Tabs } from 'expo-router'` is `@deprecated Use import { Tabs } from 'expo-router/js-tabs'`. `expo-router/js-tabs` and `expo-router/tabs` both resolve to `build/layouts/Tabs`. **The project's `expo-router/js-tabs` import is correct.**
- `@react-navigation/bottom-tabs` → `expo-router/js-tabs`, `@react-navigation/native` → `expo-router/react-navigation` (https://docs.expo.dev/router/migrate/sdk-55-to-56.md).
- Options: `tabBarIcon: ({ focused, color, size }) => ReactNode`, `tabBarActiveTintColor`, `tabBarHideOnKeyboard`, etc. (https://docs.expo.dev/router/advanced/tabs.md)
- Native tabs in SDK 55–57: `import { NativeTabs } from 'expo-router/unstable-native-tabs'` (`expo-router/native-tabs` is SDK 58+). Source: https://docs.expo.dev/router/advanced/native-tabs.md
- **`@expo/vector-icons` is not installed** and the docs say it "will be deprecated and is not recommended". Replacement: per-family `@react-native-vector-icons/<family>` packages (e.g. `@react-native-vector-icons/lucide`), codemod `npx @react-native-vector-icons/codemod`. Needs `expo-font`. Do not list their font paths in the `expo-font` plugin (build error). Sources: https://docs.expo.dev/guides/icons.md, https://expo.dev/blog/moving-away-from-expo-vector-icons
- Lightest no-dep option for a few tab icons: local PNG assets rendered with `Image`, or text glyphs.

---

## 5. expo-notifications v57
Source: https://docs.expo.dev/versions/v57.0.0/sdk/notifications.md
```ts
import * as Notifications from 'expo-notifications';
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});
// Android: create a channel BEFORE asking permission (Android 13 prompt appears only after a channel exists)
await Notifications.setNotificationChannelAsync('reminders', {
  name: '알림', importance: Notifications.AndroidImportance.HIGH,
});
const { status } = await Notifications.getPermissionsAsync();
if (status !== 'granted') await Notifications.requestPermissionsAsync(); // default asks alert+badge+sound
const id = await Notifications.scheduleNotificationAsync({
  content: { title, body, data: { url: '/today' } },
  trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(ts), channelId: 'reminders' },
});
await Notifications.cancelScheduledNotificationAsync(id);
await Notifications.cancelAllScheduledNotificationsAsync();
await Notifications.getAllScheduledNotificationsAsync();
```
- `DateTriggerInput = { type: DATE, date: Date | number, channelId? }`. A bare `Date`/number trigger is treated as DATE.
- Without `setNotificationHandler`, foreground notifications are not shown.
- Channel: after creation only name and description can change (OS limit). Pick final importance first.
- iOS permission: use `settings.ios?.status` (`Notifications.IosAuthorizationStatus.PROVISIONAL` etc.), not only root `status`.
- **iOS needs no usage-description string.** Doc: "No usage description is required". There is no `NSUserNotificationsUsageDescription` key to set.
- Android: `RECEIVE_BOOT_COMPLETED` and `POST_NOTIFICATIONS` come from the library manifest **[pkg]**. Scheduled notifications are restored after reboot.
- Config plugin keys: `icon` (96x96 all-white PNG), `color`, `defaultChannel`, `sounds`, `enableBackgroundRemoteNotifications`.

### Tap handling (cold start + warm)
```ts
const response = Notifications.getLastNotificationResponse();   // sync, v57
if (response?.notification) go(response.notification.request.content.data?.url);
const sub = Notifications.addNotificationResponseReceivedListener(r => go(r.notification.request.content.data?.url));
return () => sub.remove();
```
- v57 names: `getLastNotificationResponse()` (sync) and `clearLastNotificationResponse()` (sync). The `...Async` variants are **deprecated** ("Use `getLastNotificationResponse` instead"). Hook: `useLastNotificationResponse()` returns `undefined` (unknown yet) | `null` | response.
- Compare `response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER` for a plain tap.
- Known issue: Android **debug** builds launched from a notification show a broken splash ~70% of the time. Test with `npx expo run:android --variant release`.

### Android 12+ exact alarms
- Doc: to fire at an exact time on Android 12+ add `android.permission.SCHEDULE_EXACT_ALARM` (app.json already has it in `android.permissions`).
- **[pkg] What expo-notifications actually does** (`ExpoSchedulingDelegate.kt`): if `SDK_INT < S || alarmManager.canScheduleExactAlarms()` → `setExactAndAllowWhileIdle`, else → **silent fallback to inexact `setAndAllowWhileIdle`**. No error is thrown.
  Android docs: inexact `set*` fires "at or after" the time, on Android 12+ "usually within one hour". (https://developer.android.com/develop/background-work/services/alarms/schedule)
- **No Expo JS API exists to read `canScheduleExactAlarms()`.** Not in the v57 notifications API list or `.d.ts`.
- Opening the settings screen IS possible with `expo-intent-launcher` (no custom native code):
```ts
import { startActivityAsync, ActivityAction } from 'expo-intent-launcher';
// package name is android.package in app.json (expo-application is not installed)
await startActivityAsync(ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, { data: 'package:com.dochackchack.timebulldog' });
// resolves when the user returns to the app; then re-check & reschedule
```
  `ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM = "android.settings.REQUEST_SCHEDULE_EXACT_ALARM"` (https://docs.expo.dev/versions/v57.0.0/sdk/intent-launcher.md).
  Android Settings reference: "Optionally, the Intent's data URI can specify the application package name ... For example "package:com.my.app"" (https://developer.android.com/reference/android/provider/Settings#ACTION_REQUEST_SCHEDULE_EXACT_ALARM). Data URI scheme must be lowercase.
- Minimal CNG way to READ the permission: local Expo module (https://docs.expo.dev/modules/get-started.md):
  1. `npx create-expo-module@latest --local` → creates `modules/<name>/{android,ios,src,expo-module.config.json,index.ts}`. Autolinked. Needs a dev build (`expo-dev-client` is installed).
  2. In `expo-module.config.json` set `"platforms": ["android"]` (https://docs.expo.dev/modules/module-config.md).
  3. Kotlin, inside `ModuleDefinition { Name("ExactAlarm"); Function("canScheduleExactAlarms") { ... } }`, get `appContext.reactContext?.getSystemService(Context.ALARM_SERVICE) as AlarmManager`; return `Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()` (https://docs.expo.dev/modules/module-api.md shows `appContext.reactContext?.getSystemService(...)`).
  4. JS: `requireOptionalNativeModule('ExactAlarm')` from `expo` (null on iOS/web/Expo Go), wrap in `Platform.OS === 'android'`.
- Android facts (https://developer.android.com/develop/background-work/services/alarms/schedule):
  - Fresh installs targeting API 33+ do NOT get `SCHEDULE_EXACT_ALARM` pre-granted. Restore-to-Android-14 = denied.
  - On revoke the app process stops and future exact alarms are cancelled. On grant the system sends `ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`. Reschedule on app resume as a JS-only substitute.
  - Inexact `setWindow` min window on 12+ is 10 minutes.
- Play policy (Play Console Help "Permissions and APIs that Access Sensitive Information", https://support.google.com/googleplay/android-developer/answer/9888170): `USE_EXACT_ALARM` only for core alarm/timer and calendar-notification apps, with a declaration and review. Other apps use `SCHEDULE_EXACT_ALARM` (user-granted). Do NOT add `USE_EXACT_ALARM`. Verify the live policy wording before submission.

---

## 6. expo-updates v57 + EAS Update
Sources: https://docs.expo.dev/versions/v57.0.0/sdk/updates.md, https://docs.expo.dev/eas-update/getting-started.md
- `npx expo install expo-updates`, then `eas update:configure` (run as `npx eas-cli@latest update:configure`).
- `update:configure` "will update your app.json file with the `runtimeVersion` and `updates.url` properties, and add the `extra.eas.projectId` field". With EAS Build it also sets `channel` on `preview` and `production` profiles in eas.json.
- With a dynamic `app.config.ts`, CLI tools cannot rewrite it ("dynamic configs must be manually updated by the developer", https://docs.expo.dev/workflow/configuration.md). Keep these keys in `app.json` and spread `config` in `app.config.ts`, or copy them by hand.
- Required keys: `updates.url` = `https://u.expo.dev/<projectId>`, `runtimeVersion`.
```json
{ "expo": { "runtimeVersion": { "policy": "appVersion" }, "updates": { "url": "https://u.expo.dev/<projectId>" } } }
```
- `appVersion` policy: runtimeVersion = `expo.version`. You must bump `version` by hand on each store release and whenever native code changes, otherwise an update can land on an incompatible binary. `fingerprint` policy is the safer automatic alternative.
- Channel: eas.json `build.<profile>.channel`. Ignored when `developmentClient: true`. Without EAS Build (CNG): `updates.requestHeaders: { "expo-channel-name": "<ch>" }`.
- Defaults: `checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0` (update applies on the NEXT launch).
- Publish: `eas update --channel <ch> --message "<msg>" --environment <env>`. `eas update` runs `expo export` in production mode, which inlines `EXPO_PUBLIC_*` from the local env.

---

## 7. App config
Sources: https://docs.expo.dev/workflow/configuration.md, https://docs.expo.dev/guides/environment-variables.md, https://docs.expo.dev/versions/v57.0.0/config/app.md
```ts
// app.config.ts  (read in Node; process.env and .env files are available)
import { ExpoConfig, ConfigContext } from 'expo/config';
export default ({ config }: ConfigContext): ExpoConfig => ({ ...config, /* overrides */ });
```
- If both exist, `app.config.ts` receives `app.json` as `config` (middleware). No promises allowed. Importing other TS files needs `tsx` (devDependency present).
- `EXPO_PUBLIC_*`: inlined only when written exactly `process.env.EXPO_PUBLIC_X`. `process.env['X']` and destructuring are NOT inlined. Values are plain text in the bundle.
- .env priority: dev `.env.development.local, .env.local, .env.development, .env`; prod `.env.production.local, .env.local, .env.production, .env`. Gitignore `.env*.local`.
- `npx expo config --type public` shows what is embedded and readable via `Constants.expoConfig`. **`ios.config` and `android.config` are filtered out**, so `usesNonExemptEncryption` will not appear there. Use `npx expo config` (full) or `--type introspect`.
- iOS encryption: `ios.config.usesNonExemptEncryption: false` → sets `ITSAppUsesNonExemptEncryption`. (Alternatively `ios.infoPlist.ITSAppUsesNonExemptEncryption`, but the typed key is the documented one.)
- iOS notification permission string: **none exists / none needed** (see section 5).
- `android.permissions: ['android.permission.SCHEDULE_EXACT_ALARM']` (the doc's own example). `android.blockedPermissions: [...]` removes library-merged permissions via `tools:node="remove"`. Not in Expo Go.
- `android.softwareKeyboardLayoutMode`: `resize` (default) | `pan`.
- Android SDK levels for SDK 57: **compileSdkVersion 36, targetSdkVersion 36**, min Android 7. iOS 16.4+, Xcode 26.4+. Node ≥ 22.13. Source: https://docs.expo.dev/versions/latest/index.md
- `expo-build-properties` is only needed to override those (`android.compileSdkVersion/targetSdkVersion/minSdkVersion`). Not required by default.

---

## 8. eas.json and building
Sources: https://docs.expo.dev/eas/json.md, https://docs.expo.dev/build-reference/app-versions.md, https://docs.expo.dev/build-reference/local-builds.md
```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "environment": "development" },
    "preview":     { "distribution": "internal", "channel": "preview", "environment": "preview", "android": { "buildType": "apk" } },
    "production":  { "channel": "production", "environment": "production", "autoIncrement": true }
  }
}
```
- `remote` is recommended since EAS CLI 12. EAS stores `versionCode`/`buildNumber`, so app config values are ignored. `autoIncrement` cannot bump `version`. Sync existing store numbers with `eas build:version:set`.
- `local`: EAS reads the project. With `autoIncrement` it writes back to the project, and you must commit each bump. Avoid with a dynamic config.
- `autoIncrement` per platform: Android `true|"version"|"versionCode"`, iOS `true|"version"|"buildNumber"`.
- `distribution: "internal"` needs `.apk`/`.ipa`. `ios.simulator: true` builds for the iOS Simulator (no Apple Developer account needed for the simulator build per https://docs.expo.dev/build/setup.md).
- `environment` picks EAS env vars (`development|preview|production`). Secret-visibility vars are not available in `--local` builds.
- **Windows:** "On Windows, you can use WSL for local EAS Builds. However, we do not officially test against this platform and do not support Windows for local builds (macOS and Linux are supported)." iOS compilation needs Xcode (macOS). So from this Windows machine: iOS = cloud only. Android local = `npx expo run:android` (Android Studio) or WSL.
- **Non-interactive:** CI guide says run `eas build -p <platform>` interactively once first so the projectId, eas.json, `android.package`/`ios.bundleIdentifier` and credentials (Android keystore, iOS cert + profile) get created. "Generating your iOS credentials ... requires you to sign in with an Apple Developer Program membership" ($99/yr). After that, collaborators/CI only need `EXPO_TOKEN`. `--freeze-credentials` prevents credential changes in non-interactive mode. The docs do not spell out the exact failure message when credentials are missing. Expect an error, not a prompt.

---

## 9. Sentry (@sentry/react-native)
Sources: https://docs.sentry.io/platforms/react-native/guides/expo.md, https://docs.expo.dev/guides/using-sentry.md
- Package: `npx expo install @sentry/react-native` (requires Expo SDK 50+; `sentry-expo` is deprecated). Wizard: `npx @sentry/wizard@latest -i reactNative`.
- Config plugin: `["@sentry/react-native/expo", { "url": "https://sentry.io/", "project": "<slug>", "organization": "<org>" }]` (or `withSentry(config, {...})` in app.config.ts). Auth via `SENTRY_AUTH_TOKEN` env (EAS: sensitive/secret visibility, never commit).
- Metro: `const { getSentryExpoConfig } = require('@sentry/react-native/metro'); module.exports = getSentryExpoConfig(__dirname);` (replaces `getDefaultConfig`).
- Init + wrap root:
```tsx
import * as Sentry from '@sentry/react-native';
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (dsn) Sentry.init({ dsn, sendDefaultPii: false });
function RootLayout() { /* ... */ }
export default Sentry.wrap(RootLayout);
```
  - `dsn` option: if absent, SDK falls back to `SENTRY_DSN` env; if neither, "the SDK will just not send any events". In the browser that env fallback does not apply.
  - `enabled: false` "doesn't prevent all overhead ... To disable Sentry completely, depending on environment, call `Sentry.init` conditionally." → guard `init` with `if (dsn)`.
- Expo Router ErrorBoundary: React treats the error as handled, so "Sentry never sees the error" unless wired:
```tsx
import { ErrorBoundary as ExpoErrorBoundary } from 'expo-router';
export const ErrorBoundary = Sentry.wrapExpoRouterErrorBoundary(ExpoErrorBoundary); // or wrap a custom ({error, retry}) component
```
  Or metro option `getSentryExpoConfig(__dirname, { autoWrapExpoRouterErrorBoundary: true })` (SDK ≥ 8.17.2). Source: https://docs.sentry.io/platforms/react-native/guides/expo/tracing/instrumentation/expo-router.md
- Expo Go: the JS SDK runs; native-only features (slow/frozen frames, TTID/TTFD) are not available. Guard with `isRunningInExpoGo()` from `expo`. Source maps upload only in Release native builds. After `eas update` run `npx sentry-expo-upload-sourcemaps dist`.
- Native plugin changes need a new dev/prod build.

---

## 10. Web build and Playwright
Sources: https://docs.expo.dev/guides/publishing-websites.md, https://docs.expo.dev/deploy/web.md
- `npx expo start --web` = dev server (development mode, Metro, HMR). `npx expo export --platform web` (alias `-p web`) = production bundle into `dist/` (production mode `.env` files). `public/` is copied into `dist/`.
- `web.output`: omitted → `single` (SPA, one `index.html`). `static` = HTML per route. `server` = needs a server. Project app.json has no `web.output`, so it is `single`.
- Serve the export: `npx expo serve` → http://localhost:8081 (HTTP only). Good target for Playwright `webServer: { command: 'npx expo export -p web && npx expo serve', url: 'http://localhost:8081' }`.
- SPA hosting needs a rewrite of all paths to `/index.html` (Netlify `public/_redirects`, Vercel `rewrites`).
- Do not put files in `public/assets/` (reserved by Metro).
- Web gaps to plan for: SecureStore (none), SplashScreen.hide (native only), notifications scheduling (Android/iOS only), BackHandler (Android only), keyboard-controller (Android/iOS only per v57 page).

---

## 11. Legal docs (markdown) in-app
- No markdown renderer is part of the SDK. Simplest options without heavy deps:
  1. Bundle the text as a TS string/array and render with `<ScrollView><Text>`. Zero deps, works offline and on web.
  2. Host the docs as pages (the web export or any HTTPS URL) and open with `expo-web-browser`: `await WebBrowser.openBrowserAsync(url)`. Platforms: Android (Custom Tabs), iOS (SFSafariViewController), Web. Included in Expo Go. Install `npx expo install expo-web-browser`. Source: https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser.md
- Store reviewers want a public URL for the privacy policy anyway, so option 2 covers both.

---

## 12. Keyboard for chat input
Sources: https://docs.expo.dev/guides/keyboard-handling.md, https://reactnative.dev/docs/keyboardavoidingview, https://expo.dev/blog/edge-to-edge-display-now-streamlined-for-android
- Edge-to-edge is the default for all projects since SDK 54 and cannot be turned off on Android 16. The blog: "Like on iOS, you'll need to use KeyboardAvoidingView or — ideally — react-native-keyboard-controller." Content draws under system bars, so use safe-area insets (`react-native-safe-area-context` is installed).
- `KeyboardAvoidingView`: Expo guide uses `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`. Current RN docs say "On both iOS and Android, setting `behavior` is recommended". Test both on a real Android device. If a header is present, set `keyboardVerticalOffset`.
- Tabs pushed above keyboard on Android: `android.softwareKeyboardLayoutMode: "pan"` or `tabBarHideOnKeyboard: true`.
- `react-native-keyboard-controller` (recommended for chat): `npx expo install react-native-keyboard-controller`. Needs `react-native-reanimated` (installed 4.5.1). Wrap root in `<KeyboardProvider>`. Chat pattern: `useKeyboardHandler({ onMove: e => { 'worklet'; height.value = Math.max(e.height, 0); } }, [])` + an animated spacer. Also `KeyboardAwareScrollView`, `KeyboardToolbar`.
  - Docs conflict on Expo Go: the guide says "not included in Expo Go", the v57 SDK page says "Included in Expo Go". The project uses a dev build anyway.
  - v57 page lists Android and iOS only. Provide a web fallback (plain `View`/`KeyboardAvoidingView`) via `.web.tsx` or `Platform`.

---

## 13. Dark mode lock
Sources: https://docs.expo.dev/versions/v57.0.0/config/app.md, https://docs.expo.dev/develop/user-interface/color-themes.md
- `"userInterfaceStyle": "light"` (already in app.json). Also the default when absent.
- **Android: "Requires `expo-system-ui` be installed in your project to work on Android"**, otherwise "the `userInterfaceStyle` property is ignored" in dev builds. `expo-system-ui` is NOT installed. Fix: `npx expo install expo-system-ui`. Check with `npx expo config --type introspect` (warning: "android: userInterfaceStyle: Install expo-system-ui ...").
- Effect: native views (alerts, pickers, keyboard, status bar `auto`) stay light and `useColorScheme()` reports light on native. Web needs no config and follows the browser's `prefers-color-scheme`, so hardcode colors rather than reading `useColorScheme()` if web must stay light.
- How the splash plugin `dark` block interacts with a light lock is not documented. Omit the `dark` block.

---

## 14. Hermes Intl.DateTimeFormat + timeZone (RN 0.86)
Sources: https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md, Hermes source `lib/Platform/Intl/PlatformIntlApple.mm` and `PlatformIntlAndroid.cpp` (main branch).
- Hermes Intl uses the platform: Android = ICU4J via JNI, iOS = Foundation (NSDateFormatter/NSTimeZone). No bundled ICU, so results can vary by OS version.
- `Intl.DateTimeFormat` (constructor, `format`, `resolvedOptions`) is supported on both platforms. `timeZone` is not in either "unsupported properties" list. iOS validates the zone against `NSTimeZone.knownTimeZoneNames`.
- Unsupported: iOS `numberingSystem`, `formatMatcher`. Android `dayPeriod`, `fractionalSecondDigits`, `formatMatcher`, and `dateStyle/timeStyle` "is not implemented".
- **`DateTimeFormat.prototype.formatToParts`:** the IntlAPIs.md doc does NOT list it (doc reflects ECMA-402 7th ed., 2020, and looks stale). The Hermes main source implements it on both platforms (`DateTimeFormatApple::formatToParts`, `DateTimeFormatAndroid::formatToParts`). `hourCycle` (`h11/h12/h23/h24`) is parsed on Apple.
  → `src/lib/rules.ts` `localParts()` uses `new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year, month, day, hour, minute, second: '2-digit'... }).formatToParts(ts)`. That should work, and the existing `% 24` guard covers an `h24` "24" hour. **Not verified on device.** The exact Hermes build bundled with RN 0.86 was not checked. Do a device smoke test: `dayKeyOf(Date.now(), 'Asia/Seoul')` on Android and iOS release builds, plus a DST zone such as `America/New_York`.
- Device IANA zone: `expo-localization` `getCalendars()[0].timeZone` (e.g. `'Europe/Warsaw'`; "Can be `null` on Web"). Source: https://docs.expo.dev/versions/v57.0.0/sdk/localization.md. Fallback: `Intl.DateTimeFormat().resolvedOptions().timeZone`.
