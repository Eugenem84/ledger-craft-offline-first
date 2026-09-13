package com.ledgercraft.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

/**
 * Результат установки APK (Фаза 13, задача 13.11).
 *
 * `PackageInstaller` отвечает не сразу: сначала приходит
 * `STATUS_PENDING_USER_ACTION` с интентом системного диалога «Установить?» —
 * его обязательно нужно запустить, иначе установка не начнётся. Дальше приходит
 * итог: успех, отмена пользователем или ошибка. Всё это уезжает в JS событием
 * `installResult`.
 */
public class InstallResultReceiver extends BroadcastReceiver {

    public static final String ACTION_INSTALL_RESULT = "com.ledgercraft.app.INSTALL_RESULT";

    @SuppressWarnings("deprecation")
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }

        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);

        switch (status) {
            case PackageInstaller.STATUS_PENDING_USER_ACTION: {
                Intent confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);

                if (confirmation != null) {
                    confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(confirmation);
                }

                ApkInstallerPlugin.emitInstallResult("pendingUserAction", message);
                break;
            }
            case PackageInstaller.STATUS_SUCCESS:
                ApkInstallerPlugin.emitInstallResult("success", message);
                break;
            case PackageInstaller.STATUS_FAILURE_ABORTED:
                ApkInstallerPlugin.emitInstallResult("canceled", message);
                break;
            default:
                ApkInstallerPlugin.emitInstallResult("failed", message);
                break;
        }
    }
}
