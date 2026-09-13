package com.ledgercraft.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Свой плагин установки APK (Фаза 13, задача 13.11): npm-пакета у него нет,
        // поэтому регистрируем руками — обязательно ДО super.onCreate(), иначе
        // плагин не попадёт в мост и JS его не увидит.
        registerPlugin(ApkInstallerPlugin.class);

        super.onCreate(savedInstanceState);
    }
}

