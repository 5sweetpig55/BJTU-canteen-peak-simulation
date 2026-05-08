# 项目上下文

## 项目概览

基于 Agent 建模的单食堂就餐仿真系统，完整模拟学生「到达→排队→打饭→就餐→离开」全流程，支持 2D 可视化动画、承载能力分析和动态窗口配置建议。

## 技术栈

- **核心**: Vite 7, TypeScript, Express
- **UI**: Tailwind CSS 3
- **图表**: Chart.js 4
- **可视化**: HTML5 Canvas 2D

## 目录结构

```
├── scripts/            # 构建与启动脚本
│   ├── build.sh        # 构建脚本
│   ├── dev.sh          # 开发环境启动脚本
│   ├── prepare.sh      # 预处理脚本
│   └── start.sh        # 生产环境启动脚本
├── server/             # 服务端逻辑
│   ├── routes/         # API 路由
│   ├── server.ts       # Express 服务入口
│   └── vite.ts         # Vite 中间件集成
├── src/                # 前端源码
│   ├── simulation.ts   # 仿真引擎（Agent/窗口/座位/驱动器）
│   ├── renderer.ts     # Canvas 2D 可视化渲染器
│   ├── analysis.ts     # 统计分析与批量仿真对比
│   ├── main.ts         # 主应用逻辑（页面构建、交互控制、游戏循环）
│   ├── index.ts        # 客户端入口
│   └── index.css       # 全局样式（Tailwind CSS v3 指令）
├── index.html          # 入口 HTML
├── package.json        # 项目依赖管理
├── tsconfig.json       # TypeScript 配置
└── vite.config.ts      # Vite 配置
```

## 核心模块说明

### simulation.ts - 仿真引擎
- `AgentState` 枚举：学生状态机（ARRIVING/QUEUING/SERVING/WALKING_TO_SEAT/EATING/LEAVING/LEFT）
- `StudentAgent` 类：独立Agent，记录完整时间戳、动画位置、颜色
- `ServiceWindow` 类：窗口队列管理，忙碌状态追踪
- `Seat` 类：座位占用/释放
- `SimulationEngine` 类：时间步长驱动，管理生成→分配→服务→释放全流程
- `runBatchSimulation()` 函数：批量运行多组配置的仿真

### renderer.ts - Canvas 可视化
- `CafeteriaRenderer` 类：绘制食堂布局（入口、窗口队列、座位区、出口）
- 动态布局：根据窗口数/座位数自适应计算坐标
- Agent动画：平滑移动、状态区分渲染（排队/打饭脉冲/就餐/离开半透明）
- HUD信息：实时显示仿真时间、排队人数、窗口状态

### analysis.ts - 统计分析
- `renderSingleResult()`：单轮仿真统计（平均排队时长、窗口利用率柱状条、座位利用率）
- `runAndRenderBatch()`：批量仿真+Chart.js折线图+对比表格+配置建议
- 两张图表：窗口数-排队时长曲线、窗口数-利用率曲线
- 动态建议：基于目标排队时长（5分钟）推荐最优窗口数

### main.ts - 主应用
- 页面构建：参数面板、Canvas区域、控制按钮、实时指标
- 游戏循环：requestAnimationFrame驱动仿真推进+渲染
- 交互控制：开始/暂停/重置、速度调节

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。

## 构建和测试命令

- `pnpm ts-check` - TypeScript 类型检查
- `pnpm lint:build` - ESLint 静态检查
- `pnpm dev` - 启动开发服务器（端口5000）

## 开发规范

- 使用 Tailwind CSS 进行样式开发
- Tailwind v3 使用 `@tailwind base/components/utilities` 指令（非 `@import "tailwindcss"`）

### 编码规范

- 默认按 TypeScript `strict` 心智写代码
- 禁止隐式 `any` 和 `as any`
- 所有函数参数、返回值需有明确类型
- 清理未使用的变量和导入
