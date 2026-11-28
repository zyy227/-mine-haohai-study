#!/usr/bin/env python3
"""
去掉 Capacitor / Android 12+ 原生启动页的白底 + 蓝色 X 图标。
在系统 SplashScreen 里把图标设为全透明、背景设成与主界面一致的深蓝 #0a2247，
这样点击 App 后视觉上直接进入主界面，不再看到蓝 X 启动图。

用法：python3 remove-native-splash-icon.py
在 GitHub Actions 中于 `npx capacitor-assets generate --android` 之后调用。
无匹配文件时静默跳过，不影响构建。
"""
import os
import re

RES = os.path.join("android", "app", "src", "main", "res")
BG = "#0a2247"
TRANSPARENT_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "YGD4DwABAgEAHfP7WQAAAABJRU5ErkJggg=="
)

changed = []

# 1) 写入 1x1 全透明图标
drawable = os.path.join(RES, "drawable")
os.makedirs(drawable, exist_ok=True)
icon_path = os.path.join(drawable, "splash_transparent.png")
try:
    import base64
    with open(icon_path, "wb") as f:
        f.write(base64.b64decode(TRANSPARENT_PNG))
    changed.append(icon_path)
except Exception as e:
    print("skip transparent icon:", e)

# 2) 修改所有 styles.xml：图标透明 + 背景深蓝
for root, _dirs, files in os.walk(RES):
    for fn in files:
        if fn != "styles.xml":
            continue
        path = os.path.join(root, fn)
        try:
            s = open(path, encoding="utf-8").read()
        except Exception:
            continue
        orig = s
        # 图标设为透明（值可能是 @drawable/splashscreen_anim 等）
        s = re.sub(
            r'(<item[^>]*name="windowSplashScreenAnimatedIcon"[^>]*>)[^<]*(</item>)',
            r'\1@drawable/splash_transparent\2', s, flags=re.I)
        s = re.sub(
            r'(<item[^>]*name="android:windowSplashScreenAnimatedIcon"[^>]*>)[^<]*(</item>)',
            r'\1@drawable/splash_transparent\2', s, flags=re.I)
        # 背景设为深蓝
        s = re.sub(
            r'(<item[^>]*name="windowSplashScreenBackground"[^>]*>)[^<]*(</item>)',
            r'\1' + BG + r'\2', s, flags=re.I)
        # 老式 windowBackground（指向 splash drawable）也替换
        s = re.sub(
            r'(<item[^>]*name="android:windowBackground"[^>]*>)[^<]*(</item>)',
            r'\1' + BG + r'\2', s, flags=re.I)
        if s != orig:
            open(path, "w", encoding="utf-8").write(s)
            changed.append(path)

# 3) colors.xml 里的 splash 背景色
for root, _dirs, files in os.walk(RES):
    for fn in files:
        if fn != "colors.xml":
            continue
        path = os.path.join(root, fn)
        try:
            s = open(path, encoding="utf-8").read()
        except Exception:
            continue
        orig = s
        s = re.sub(
            r'(<color[^>]*name="splashscreen_background"[^>]*>)[^<]*(</color>)',
            r'\1' + BG + r'\2', s, flags=re.I)
        if s != orig:
            open(path, "w", encoding="utf-8").write(s)
            changed.append(path)

print("splash patched:", len(changed), "file(s)")
for p in changed:
    print("  -", p.replace("\\", "/"))
