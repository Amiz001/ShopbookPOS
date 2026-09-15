import { Alert } from 'react-native';

/**
 * Keep an uncaught JS error from taking the app down in release builds.
 *
 * React Native's default handler shows the red box in development and
 * terminates the process in production. Render errors are already caught by
 * the error boundaries; this covers everything else (event handlers, timers,
 * native callbacks). In development the default handler is kept so the red
 * box still points at the offending line.
 */
export function installCrashGuard(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsType }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;

  const defaultHandler = errorUtils.getGlobalHandler?.();
  let alertOpen = false;

  errorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[CrashGuard]', isFatal ? 'fatal' : 'non-fatal', error);

    if (__DEV__) {
      defaultHandler?.(error, isFatal);
      return;
    }

    if (isFatal && !alertOpen) {
      alertOpen = true;
      Alert.alert(
        'Unexpected error',
        'Something went wrong, but your data is safe. If this keeps happening, restart the app.',
        [{ text: 'OK', onPress: () => (alertOpen = false) }]
      );
    }
  });
}

type ErrorHandler = (error: Error, isFatal?: boolean) => void;
type ErrorUtilsType = {
  setGlobalHandler: (handler: ErrorHandler) => void;
  getGlobalHandler?: () => ErrorHandler;
};
