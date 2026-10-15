package com.ledgercraft.app;

import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

import java.util.Objects;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Свой плагин установки APK (Фаза 13, задача 13.11): npm-пакета у него нет,
        // поэтому регистрируем руками — обязательно ДО super.onCreate(), иначе
        // плагин не попадёт в мост и JS его не увидит.
        registerPlugin(ApkInstallerPlugin.class);

        super.onCreate(savedInstanceState);

        applyKeyboardInsets();
    }

    /**
     * Клавиатура не должна накрывать поля ввода (задача 14.30, живой отчёт 12.10.2026).
     *
     * <p>Почему это нужно здесь, а не в веб-слое: с `targetSdk 35` на Android 15 система включает
     * edge-to-edge принудительно, а Capacitor 7 в режиме `android.adjustMarginsForEdgeToEdge: "auto"`
     * сам раздаёт отступы системных панелей через слушателя инсетов — но учитывает только
     * `systemBars()` и `displayCutout()`, а инсет **клавиатуры** (`Type.ime()`) не смотрит вовсе
     * и возвращает `CONSUMED` (см. `CapacitorWebView.edgeToEdgeHandler`). Итого окно под клавиатуру
     * не уменьшалось: она просто перекрывала нижнюю часть страницы — а там поля «комментарии»
     * в карточке заказа и поля входа/регистрации.
     *
     * <p>Решение: свой слушатель на том же WebView (ставится после `super.onCreate()`, то есть
     * после Capacitor, и заменяет его), который повторяет отступы панелей Capacitor и добавляет
     * к нижнему отступу высоту клавиатуры (`Math.max` — клавиатура всегда выше навигационной
     * панели). View становится ниже на высоту клавиатуры, веб-вьюпорт уменьшается — то самое
     * поведение `adjustResize`, на которое верстка и рассчитана.
     *
     * <p>Вмешиваемся **только** когда активны отступы edge-to-edge (Android 15+ и режим `auto`
     * без opt-out в теме): на Android 12–14 отступы даёт сама платформа, и лишние margin'ы
     * сломали бы раскладку.
     */
    private void applyKeyboardInsets() {
        if (!shouldAdjustMarginsForEdgeToEdge()) return;

        View webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());

            ViewGroup.LayoutParams raw = view.getLayoutParams();
            if (!(raw instanceof ViewGroup.MarginLayoutParams)) return windowInsets;

            ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) raw;
            params.leftMargin = bars.left;
            params.rightMargin = bars.right;
            params.topMargin = bars.top;
            params.bottomMargin = Math.max(bars.bottom, ime.bottom);
            view.setLayoutParams(params);

            // Дочерним view инсеты не раздаём — ровно как это делает Capacitor.
            return WindowInsetsCompat.CONSUMED;
        });

        ViewCompat.requestApplyInsets(webView);
    }

    /**
     * Активны ли отступы edge-to-edge — та же проверка, что в `CapacitorWebView.edgeToEdgeHandler`:
     * `force` всегда, `auto` — на Android 15+, если тема не отказалась от edge-to-edge
     * (`android:windowOptOutEdgeToEdgeEnforcement`).
     */
    private boolean shouldAdjustMarginsForEdgeToEdge() {
        CapConfig config = getBridge() == null ? null : getBridge().getConfig();
        if (config == null) return false;

        String mode = config.adjustMarginsForEdgeToEdge();
        if (Objects.equals(mode, "force")) return true;
        if (!Objects.equals(mode, "auto")) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return false;

        TypedValue value = new TypedValue();
        boolean optOutFound = getTheme().resolveAttribute(android.R.attr.windowOptOutEdgeToEdgeEnforcement, value, true);

        return !(optOutFound && value.data != 0);
    }
}

