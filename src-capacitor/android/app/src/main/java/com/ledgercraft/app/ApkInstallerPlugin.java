package com.ledgercraft.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;

/**
 * Установка обновления APK (Фаза 13, задача 13.11).
 *
 * Своего npm-пакета у плагина нет — он регистрируется в `MainActivity`, а JS
 * вызывает его через `registerPlugin('ApkInstaller')`. Так сделано потому, что
 * готовых поддерживаемых Capacitor-плагинов установки APK нет, а Cordova-плагины
 * (cordova-plugin-apkupdater) тянут устаревшую платформу, которой в проекте нет.
 *
 * Почему `PackageInstaller`, а не `ACTION_VIEW`: системный `ACTION_VIEW` на APK с
 * Android 9+ уже не гарантирует установку, а `PackageInstaller.Session` — это
 * официальный путь. Поток установки такой:
 *   1) `canInstall()` — разрешена ли установка из нашего источника (Android 8+);
 *      если нет — `openSettings()` ведёт на системный экран разрешения;
 *   2) `install({ path })` — копируем файл из кэша приложения в сессию установщика
 *      и коммитим с `PendingIntent` на наш `InstallResultReceiver`;
 *   3) система присылает `STATUS_PENDING_USER_ACTION` — показываем пользователю
 *      диалог «Установить?» (без этого шага установка не начнётся);
 *   4) результат уходит в JS событием `installResult`.
 *
 * Тихий режим (без диалога) Android разрешает только владельцу устройства
 * (Device Owner / MDM), поэтому один тап пользователя остаётся всегда.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static ApkInstallerPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** Прокидывает результат установки из `InstallResultReceiver` в JS. */
    static void emitInstallResult(String status, String message) {
        ApkInstallerPlugin plugin = instance;

        if (plugin == null || plugin.getActivity() == null) {
            return;
        }

        plugin.getActivity().runOnUiThread(() -> {
            JSObject data = new JSObject();
            data.put("status", status);
            data.put("message", message == null ? "" : message);
            plugin.notifyListeners("installResult", data);
        });
    }

    /** Разрешена ли установка приложений из этого источника (Android 8+). */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            result.put("granted", getContext().getPackageManager().canRequestPackageInstalls());
        } else {
            // До Android 8 система спрашивает разрешение при первом APK.
            result.put("granted", true);
        }

        call.resolve(result);
    }

    /** Системный экран «Установка неизвестных приложений» для нашего приложения. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));

            if (getActivity() != null) {
                getActivity().startActivity(intent);
            }
        }

        call.resolve();
    }

    /** Открыть системный установщик для APK, скачанного в кэш приложения. */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");

        if (path == null || path.isEmpty()) {
            call.reject("Не передан путь к файлу обновления");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                call.reject("NOT_ALLOWED");
                return;
            }
        }

        // `@capacitor/filesystem` отдаёт путь как `file:///…` — оставляем сам путь.
        String normalized = path.startsWith("file://") ? path.substring("file://".length()) : path;
        File apk = new File(normalized);

        if (!apk.exists()) {
            call.reject("Файл обновления не найден");
            return;
        }

        PackageInstaller.Session session = null;

        try {
            PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);

            params.setAppPackageName(getContext().getPackageName());

            int sessionId = installer.createSession(params);
            session = installer.openSession(sessionId);

            try (OutputStream out = session.openWrite("ledger-craft-update", 0, apk.length());
                 FileInputStream in = new FileInputStream(apk)) {
                byte[] buffer = new byte[8192];
                int read;

                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }

                session.fsync(out);
            }

            Intent resultIntent = new Intent(getContext(), InstallResultReceiver.class);
            resultIntent.setAction(InstallResultReceiver.ACTION_INSTALL_RESULT);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE;
            PendingIntent pendingIntent =
                PendingIntent.getBroadcast(getContext(), sessionId, resultIntent, flags);

            session.commit(pendingIntent.getIntentSender());

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("sessionId", sessionId);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Не удалось запустить установку: " + error.getMessage());
        } finally {
            if (session != null) {
                try {
                    session.close();
                } catch (Exception ignored) {
                    // сессия уже закрыта системой — установке это не мешает
                }
            }
        }
    }
}
