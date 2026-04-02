# 眨眼检测系统托盘应用 — 设计文档

## 概述

将现有的纯浏览器眨眼检测应用升级为 Windows 系统托盘常驻应用。后台持续进行眨眼检测，托盘图标实时反映状态，右键菜单提供快捷操作，Dashboard WebView 提供完整的数据可视化和设置界面。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面框架 | **Tauri v2** | 系统托盘、窗口管理、IPC |
| 后端语言 | **Rust** | 摄像头采集、模型推理、眨眼检测、数据存储 |
| 摄像头 | **nokhwa** crate | 跨平台摄像头访问 |
| 模型推理 | **ort** crate (ONNX Runtime) | 加载 MediaPipe face landmarks 模型 |
| 数据库 | **rusqlite** | 嵌入式 SQLite |
| 前端 | **HTML/CSS/JS** | Dashboard UI（Tauri WebView 加载） |
| 图表 | **Chart.js** | 实时曲线和趋势图 |

## 系统架构

```
┌─────────────────────────────────────────────────┐
│                  Tauri App                       │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           Rust Backend                    │   │
│  │                                           │   │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────┐ │   │
│  │  │ Camera   │→│ ONNX     │→│ Blink   │ │   │
│  │  │ Capture  │  │ Runtime  │  │ Detector│ │   │
│  │  │ (nokhwa) │  │ (ort)    │  │ (EAR)   │ │   │
│  │  └─────────┘  └──────────┘  └────┬────┘ │   │
│  │                                    │      │   │
│  │  ┌─────────┐  ┌──────────┐       │      │   │
│  │  │ System  │  │ SQLite   │←──────┘      │   │
│  │  │ Tray    │  │ Storage  │               │   │
│  │  └─────────┘  └────┬─────┘               │   │
│  └──────────────────────┼────────────────────┘   │
│                         │ Tauri Events (IPC)      │
│  ┌──────────────────────┼────────────────────┐   │
│  │        Web Dashboard (WebView)             │   │
│  └────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 数据流

1. `nokhwa` 每帧采集摄像头画面
2. `ort` 推理得到 468 个人脸关键点
3. 取眼部 12 个点计算 EAR（Eye Aspect Ratio）
4. EAR 低于阈值（默认 0.25）连续 2 帧 = 一次眨眼
5. 眨眼事件写入 SQLite + 通过 Tauri event 推送到前端
6. 每秒更新统计，托盘图标根据疲劳度变色
7. 触发提醒条件时发送 Windows toast 通知

## 系统托盘

### 图标状态

| 颜色 | 含义 |
|------|------|
| 绿色 | 正常（疲劳度 < 40） |
| 黄色 | 偏疲劳（疲劳度 40-60） |
| 橙色 | 较疲劳（疲劳度 60-80） |
| 红色 | 很疲劳（疲劳度 80+） |
| 灰色 | 未在检测 / 未检测到人脸 |

### 右键菜单

```
┌──────────────────────────┐
│  👁 眨眼频率: 18次/分     │  ← 实时状态（彩色圆点）
│  ● 状态: 正常             │
│──────────────────────────│
│  ▶ 开始检测 / ⏸ 暂停     │
│  🌐 打开 Dashboard       │
│──────────────────────────│
│  ⚙ 设置                  │
│    ├ 开机自启             │  ← 勾选项
│    ├ 灵敏度: 中           │  ← 子菜单(低/中/高)
│    └ 通知提醒             │  ← 勾选项
│──────────────────────────│
│  ✕ 退出                  │
└──────────────────────────┘
```

## Dashboard UI

### 布局：侧边导航

左侧窄导航栏（图标），右侧大面积内容区。摄像头画面以可拖动悬浮窗形式显示在右上角。

**导航项：**
- 👁 实时监控（默认页）
- 📈 实时图表
- 📊 趋势分析（今日/每周汇总）
- 📋 历史记录
- ⚙ 设置

### 实时监控页

- 摄像头悬浮窗（右上角，可拖动缩放）
- 4 个统计卡片：眨眼频率（次/分）、状态、总次数、已运行时长
- 疲劳度仪表盘（0-100 评分）
- 20-20-20 倒计时环

### 趋势分析页

- 今日小时级眨眼频率折线图
- 本周每日汇总柱状图
- 离开时段以灰色区域标注

### 历史记录页

- 会话列表：开始/结束时间、时长、平均频率、总眨眼数
- 点击展开详情

### 设置页

所有参数旁带 ⓘ 图标，hover 显示 tooltip 说明。

**检测参数：**
- EAR 阈值（默认 0.25）ⓘ "眼睛纵横比阈值，越低越不容易误判，越高越灵敏"
- 最小连续帧（默认 2）ⓘ "EAR 需连续低于阈值的帧数，防止眨眼误检"
- 防抖时间（默认 100ms）ⓘ "两次眨眼之间的最短间隔，避免一次眨眼被重复计数"
- 检测帧率（默认 30fps）ⓘ "每秒分析的摄像头帧数，越高越精确但 CPU 占用越大"

**提醒设置：**
- 渐进式提醒开关 ⓘ "根据疲劳度分级提醒，避免频繁打扰"
- 20-20-20 提醒开关 ⓘ "每 20 分钟提醒远眺 20 秒"
- 20-20-20 间隔（默认 20min）
- 提醒冷却时间（默认 10min）
- 基线状态显示 ⓘ "正在学习你的眨眼习惯，2 天后启用个性化提醒"

**系统：**
- 开机自启动
- 启动后自动开始检测
- 启动时最小化到托盘
- 恢复默认设置按钮

## 智能提醒系统

### 个人基线学习

- 前 2 天为校准期，使用固定阈值（10 次/分）
- 按时间段记录平均眨眼频率和 EAR 恢复时间（上午/下午/晚上）
- 校准完成后切换为个人基线，提醒阈值 = 个人基线 × 0.7

### 疲劳度评分（0-100）

| 因子 | 权重 | 说明 |
|------|------|------|
| 眨眼频率 vs 个人基线 | 40% | 频率越低于基线，分数越高 |
| 眨眼速度（EAR 恢复时间） | 30% | 疲劳时眨眼变慢，恢复时间变长 |
| 连续用眼时长 | 30% | 持续用眼越久，疲劳累积越多 |

### 渐进式提醒

| 疲劳度 | 级别 | 行为 |
|--------|------|------|
| 40-60 | 轻 | 托盘图标变黄 |
| 60-80 | 中 | 通知"注意眨眼" + 图标变橙 |
| 80+ | 强 | 通知"建议休息" + 图标变红 |

- 每级提醒后进入 10 分钟冷却期，不重复同级别提醒
- 疲劳度下降后自动降级

### 20-20-20 法则

- 每 20 分钟触发一次（可配置）
- Dashboard 弹出全屏 20 秒倒计时
- 托盘同时弹通知（防止 Dashboard 未打开）
- 倒计时结束后自动关闭

## 离开检测

- 连续 3 秒未检测到人脸 → 判定为"离开"
- 离开期间：暂停眨眼频率计算、暂停疲劳度累积、暂停 20-20-20 计时
- 重新检测到人脸 → 恢复所有计算
- 托盘图标变灰 + 菜单显示"未检测到人脸"
- 离开/返回事件记录到数据库，Dashboard 趋势图以灰色区域标注离开时段

## 数据模型（SQLite）

```sql
-- 每次眨眼事件
CREATE TABLE blink_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   INTEGER NOT NULL,  -- unix ms
    ear_value   REAL NOT NULL      -- 触发时的 EAR 值
);

-- 每分钟统计快照
CREATE TABLE minute_stats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    minute_ts   INTEGER NOT NULL,  -- 该分钟起始时间
    blink_count INTEGER NOT NULL,
    avg_ear     REAL NOT NULL
);

-- 会话记录
CREATE TABLE sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time    INTEGER NOT NULL,
    end_time      INTEGER,
    total_blinks  INTEGER DEFAULT 0,
    avg_rate      REAL DEFAULT 0.0
);

-- 个人基线
CREATE TABLE baselines (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    period        TEXT NOT NULL,     -- "morning" / "afternoon" / "evening"
    avg_rate      REAL NOT NULL,
    avg_recovery  REAL NOT NULL,     -- EAR 恢复时间 ms
    sample_days   INTEGER DEFAULT 0,
    updated_at    INTEGER NOT NULL
);

-- 离开/返回事件
CREATE TABLE presence_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT NOT NULL,       -- "left" / "returned"
    timestamp   INTEGER NOT NULL
);

-- 设置
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL              -- JSON 序列化
);
```

## 项目结构（预计）

```
zhayan/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs              -- Tauri 入口
│   │   ├── tray.rs              -- 系统托盘菜单和图标管理
│   │   ├── camera.rs            -- nokhwa 摄像头采集
│   │   ├── detector.rs          -- ONNX 推理 + EAR 计算
│   │   ├── blink.rs             -- 眨眼判定 + 防抖
│   │   ├── stats.rs             -- 统计和疲劳度评分
│   │   ├── alerter.rs           -- 提醒引擎（渐进式 + 20-20-20）
│   │   ├── baseline.rs          -- 个人基线学习
│   │   ├── presence.rs          -- 离开检测
│   │   ├── db.rs                -- SQLite 数据访问层
│   │   ├── commands.rs          -- Tauri IPC 命令
│   │   └── settings.rs          -- 设置管理
│   └── models/
│       └── face_landmarker.onnx -- MediaPipe 人脸关键点模型
├── src/                         -- 前端 Dashboard
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js               -- Dashboard 主逻辑
│       ├── charts.js            -- Chart.js 图表
│       ├── history.js           -- 历史记录展示
│       ├── settings.js          -- 设置面板
│       └── api.js               -- Tauri IPC 调用封装
├── docs/
│   └── superpowers/specs/       -- 设计文档
└── index.html                   -- 原始纯浏览器版本（保留）
```
