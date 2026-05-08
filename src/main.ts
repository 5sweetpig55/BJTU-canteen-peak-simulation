/**
 * 食堂就餐仿真系统 - 主应用 v2
 * 整合仿真引擎、Canvas渲染、统计分析、交互控制
 *
 * 关键修复：
 * - 默认打饭耗时0.5分钟(30秒)，4窗口吞吐8人/分，10人/分时有排队效应
 * - 默认80座位，保证就餐区不成为瓶颈
 * - 批量仿真用5/10/15人/分，从欠载到超载全覆盖
 */

import { SimulationEngine, SimConfig, AgentState } from './simulation';
import { CafeteriaRenderer } from './renderer';
import { renderSingleResult, runAndRenderBatch, BatchParams } from './analysis';

// ======================== 默认参数 ========================

// 合理默认值：4窗口×0.5分/份=8人/分吞吐，10人/分时有排队，可观察窗口数效果
const DEFAULT_CONFIG: SimConfig = {
  totalDuration: 60,
  windowCount: 4,
  seatCount: 80,
  arrivalRate: 10,
  serveTime: 0.5,
  eatTime: 10,
  speedMultiplier: 10,
};

// ======================== 应用状态 ========================

let engine = new SimulationEngine({ ...DEFAULT_CONFIG });
let renderer: CafeteriaRenderer | null = null;
let animationId: number | null = null;
let lastFrameTime = 0;
let isRunning = false;
let isPaused = false;

// ======================== 页面构建 ========================

export function initApp(): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      <!-- 顶部标题 -->
      <header class="bg-white/80 backdrop-blur-sm border-b border-amber-200 px-6 py-3">
        <div class="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 class="text-xl font-bold text-gray-800">食堂就餐仿真系统</h1>
            <p class="text-xs text-gray-500">Agent建模 | 排队 → 打饭 → 就餐 → 离场 | 承载能力分析</p>
          </div>
          <div class="flex gap-2 text-xs">
            <span id="status-badge" class="px-3 py-1 rounded-full bg-gray-100 text-gray-600">就绪</span>
          </div>
        </div>
      </header>

      <div class="max-w-7xl mx-auto px-4 py-4">
        <!-- 控制面板 + Canvas -->
        <div class="flex gap-4 mb-4">
          <!-- 左侧控制面板 -->
          <div class="w-64 flex-shrink-0 space-y-3">
            <!-- 参数设置 -->
            <div class="bg-white rounded-xl shadow-sm border p-4">
              <h3 class="font-bold text-sm text-gray-700 mb-3">仿真参数</h3>
              <div class="space-y-2">
                <div>
                  <label class="text-xs text-gray-500 block mb-1">仿真时长(分钟)</label>
                  <input id="cfg-duration" type="number" value="${DEFAULT_CONFIG.totalDuration}" min="10" max="300" step="10"
                    class="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">窗口数量</label>
                  <input id="cfg-windows" type="number" value="${DEFAULT_CONFIG.windowCount}" min="1" max="10"
                    class="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">座位数量</label>
                  <input id="cfg-seats" type="number" value="${DEFAULT_CONFIG.seatCount}" min="5" max="200"
                    class="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">到店速率(人/分钟)</label>
                  <input id="cfg-rate" type="number" value="${DEFAULT_CONFIG.arrivalRate}" min="1" max="50"
                    class="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">打饭耗时(分钟/份)</label>
                  <input id="cfg-serve" type="number" value="${DEFAULT_CONFIG.serveTime}" min="0.1" max="10" step="0.1"
                    class="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">就餐耗时(分钟)</label>
                  <input id="cfg-eat" type="number" value="${DEFAULT_CONFIG.eatTime}" min="3" max="30"
                    class="w-full border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">仿真速度(倍)</label>
                  <input id="cfg-speed" type="range" value="${DEFAULT_CONFIG.speedMultiplier}" min="1" max="60" step="1"
                    class="w-full" />
                  <span id="speed-label" class="text-xs text-gray-500">${DEFAULT_CONFIG.speedMultiplier}x</span>
                </div>
              </div>
            </div>

            <!-- 吞吐量提示 -->
            <div id="throughput-hint" class="bg-blue-50 rounded-lg p-3 border border-blue-200 text-xs text-blue-700">
              <div class="font-bold mb-1">系统吞吐量分析</div>
              <div id="throughput-text">最大吞吐: 8人/分 | 当前需求: 10人/分</div>
            </div>

            <!-- 操作按钮 -->
            <div class="bg-white rounded-xl shadow-sm border p-4 space-y-2">
              <button id="btn-start" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition">
                开始仿真
              </button>
              <div class="flex gap-2">
                <button id="btn-pause" class="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-3 rounded-lg text-sm transition" disabled>
                  暂停
                </button>
                <button id="btn-reset" class="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg text-sm transition">
                  重置
                </button>
              </div>
            </div>

            <!-- 实时指标 -->
            <div class="bg-white rounded-xl shadow-sm border p-4">
              <h3 class="font-bold text-sm text-gray-700 mb-2">实时指标</h3>
              <div id="live-stats" class="space-y-1 text-xs text-gray-600">
                <div>等待启动...</div>
              </div>
            </div>

            <!-- 图例 -->
            <div class="bg-white rounded-xl shadow-sm border p-4">
              <h3 class="font-bold text-sm text-gray-700 mb-2">图例</h3>
              <div class="space-y-1.5 text-xs">
                <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-orange-400 inline-block border border-gray-400"></span>排队中</div>
                <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-yellow-400 inline-block border-2 border-amber-700"></span>打饭中(脉冲)</div>
                <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-amber-600 inline-block border border-amber-900"></span>等座位</div>
                <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-blue-400 inline-block border border-blue-800"></span>就餐中</div>
                <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-gray-400 inline-block opacity-50"></span>离开中</div>
              </div>
            </div>
          </div>

          <!-- 右侧Canvas -->
          <div class="flex-1 bg-white rounded-xl shadow-sm border overflow-hidden" style="min-height:560px;">
            <canvas id="sim-canvas" class="w-full h-full block" style="min-height:560px;"></canvas>
          </div>
        </div>

        <!-- 统计结果区域 -->
        <div id="result-section" class="hidden mb-4">
          <div class="bg-white rounded-xl shadow-sm border p-5">
            <div id="single-result"></div>
          </div>
        </div>

        <!-- 批量仿真区域 -->
        <div class="bg-white rounded-xl shadow-sm border p-5 mb-4">
          <h3 class="text-lg font-bold text-gray-800 mb-2">承载能力分析 - 批量仿真对比</h3>
          <p class="text-xs text-gray-500 mb-3">
            自动测试不同窗口数量(3/4/5/6个)在不同人流压力(5/10/15人/分钟)下的表现。
            使用当前参数中的打饭耗时、就餐耗时和座位数，生成对比表格和折线图，给出动态配置建议。
            <span class="text-blue-600">所有数据均来自真实仿真运算，非预设值。</span>
          </p>
          <button id="btn-batch" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg text-sm transition">
            运行批量仿真
          </button>
          <span id="batch-loading" class="hidden ml-3 text-sm text-gray-500">正在运行批量仿真，请稍候...</span>

          <div id="batch-result" class="mt-4 hidden">
            <!-- 批量仿真结果将在这里动态渲染 -->
          </div>
        </div>
      </div>
    </div>
  `;

  // 初始化Canvas渲染器
  const canvas = document.getElementById('sim-canvas') as HTMLCanvasElement;
  renderer = new CafeteriaRenderer(canvas, engine);

  bindEvents();
  updateThroughputHint();
  renderer.render();
}

// ======================== 事件绑定 ========================

function bindEvents(): void {
  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
  const btnBatch = document.getElementById('btn-batch') as HTMLButtonElement;
  const speedSlider = document.getElementById('cfg-speed') as HTMLInputElement;
  const speedLabel = document.getElementById('speed-label') as HTMLSpanElement;

  btnStart.addEventListener('click', startSimulation);
  btnPause.addEventListener('click', togglePause);
  btnReset.addEventListener('click', resetSimulation);
  btnBatch.addEventListener('click', runBatchAnalysis);

  speedSlider.addEventListener('input', () => {
    const val = parseInt(speedSlider.value);
    speedLabel.textContent = `${val}x`;
    engine.config.speedMultiplier = val;
  });

  // 参数变化时更新吞吐量提示
  const paramInputs = ['cfg-duration', 'cfg-windows', 'cfg-seats', 'cfg-rate', 'cfg-serve', 'cfg-eat'];
  for (const id of paramInputs) {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) {
      el.addEventListener('change', updateThroughputHint);
    }
  }

  window.addEventListener('resize', () => {
    if (renderer) {
      renderer.updateLayout();
      renderer.render();
    }
  });
}

/** 计算并显示系统吞吐量提示 */
function updateThroughputHint(): void {
  const windows = parseInt((document.getElementById('cfg-windows') as HTMLInputElement).value) || 4;
  const serveTime = parseFloat((document.getElementById('cfg-serve') as HTMLInputElement).value) || 0.5;
  const rate = parseInt((document.getElementById('cfg-rate') as HTMLInputElement).value) || 10;

  const maxThroughput = windows / serveTime; // 人/分钟
  const isOverloaded = rate > maxThroughput;

  const textEl = document.getElementById('throughput-text');
  const hintEl = document.getElementById('throughput-hint');
  if (textEl && hintEl) {
    textEl.innerHTML = `最大吞吐: <b>${maxThroughput.toFixed(1)}</b>人/分 | 当前需求: <b>${rate}</b>人/分 ` +
      (isOverloaded ? `<span class="text-red-600 font-bold">(超载!队列会持续增长)</span>` : `<span class="text-green-600">(可承受)</span>`);
    hintEl.className = isOverloaded
      ? 'bg-red-50 rounded-lg p-3 border border-red-200 text-xs text-red-700'
      : 'bg-blue-50 rounded-lg p-3 border border-blue-200 text-xs text-blue-700';
  }
}

// ======================== 仿真控制 ========================

function readConfig(): SimConfig {
  return {
    totalDuration: parseInt((document.getElementById('cfg-duration') as HTMLInputElement).value) || 60,
    windowCount: parseInt((document.getElementById('cfg-windows') as HTMLInputElement).value) || 4,
    seatCount: parseInt((document.getElementById('cfg-seats') as HTMLInputElement).value) || 80,
    arrivalRate: parseInt((document.getElementById('cfg-rate') as HTMLInputElement).value) || 10,
    serveTime: parseFloat((document.getElementById('cfg-serve') as HTMLInputElement).value) || 0.5,
    eatTime: parseInt((document.getElementById('cfg-eat') as HTMLInputElement).value) || 10,
    speedMultiplier: parseInt((document.getElementById('cfg-speed') as HTMLInputElement).value) || 10,
  };
}

function startSimulation(): void {
  if (isRunning && !isPaused) return;

  if (!isRunning) {
    const config = readConfig();
    engine = new SimulationEngine(config);
    engine.running = true;
    isRunning = true;
    isPaused = false;

    if (renderer) {
      renderer.setEngine(engine);
    }
  } else if (isPaused) {
    isPaused = false;
  }

  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
  btnStart.disabled = true;
  btnStart.classList.add('opacity-50');
  btnPause.disabled = false;

  updateStatus('运行中', 'bg-green-100 text-green-700');
  lastFrameTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function togglePause(): void {
  if (!isRunning) return;

  isPaused = !isPaused;
  const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;

  if (isPaused) {
    btnPause.textContent = '继续';
    updateStatus('已暂停', 'bg-yellow-100 text-yellow-700');
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  } else {
    btnPause.textContent = '暂停';
    updateStatus('运行中', 'bg-green-100 text-green-700');
    lastFrameTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
  }

  btnStart.disabled = isPaused;
  btnStart.classList.toggle('opacity-50', !isPaused);
}

function resetSimulation(): void {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  isRunning = false;
  isPaused = false;

  const config = readConfig();
  engine = new SimulationEngine(config);

  if (renderer) {
    renderer.setEngine(engine);
    renderer.render();
  }

  const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
  btnStart.disabled = false;
  btnStart.classList.remove('opacity-50');
  btnPause.disabled = true;
  btnPause.textContent = '暂停';

  updateStatus('就绪', 'bg-gray-100 text-gray-600');
  updateLiveStats();
  document.getElementById('result-section')?.classList.add('hidden');
}

// ======================== 游戏循环 ========================

function gameLoop(timestamp: number): void {
  if (!isRunning || isPaused || !renderer) return;

  const realDt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
  lastFrameTime = timestamp;

  // 仿真步长 = 真实时间(秒) × 速度倍率
  const simDt = realDt * engine.config.speedMultiplier;

  // 分步推进（每步不超过0.5分钟，保证精度）
  const maxStep = 0.5;
  let remaining = simDt;
  while (remaining > 0 && !engine.finished) {
    const step = Math.min(remaining, maxStep);
    engine.step(step);
    remaining -= step;
  }

  renderer.updateAgentPositions(realDt * 1000);
  renderer.render();
  updateLiveStats();

  if (engine.finished) {
    isRunning = false;
    updateStatus('已完成', 'bg-blue-100 text-blue-700');

    const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
    const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
    btnStart.disabled = false;
    btnStart.classList.remove('opacity-50');
    btnPause.disabled = true;

    showResult();
    return;
  }

  animationId = requestAnimationFrame(gameLoop);
}

// ======================== UI更新 ========================

function updateStatus(text: string, className: string): void {
  const badge = document.getElementById('status-badge');
  if (badge) {
    badge.textContent = text;
    badge.className = `px-3 py-1 rounded-full text-xs font-bold ${className}`;
  }
}

function updateLiveStats(): void {
  const container = document.getElementById('live-stats');
  if (!container) return;

  const e = engine;
  const serving = e.agents.filter(a => a.state === AgentState.SERVING).length;
  const eating = e.agents.filter(a => a.state === AgentState.EATING).length;
  const waitSeat = e.getSeatWaitCount();
  const leaving = e.agents.filter(a => a.state === AgentState.LEAVING).length;

  const completed = e.agents.filter(a => a.completed);
  const avgQueue = completed.length > 0
    ? (completed.reduce((s, a) => s + a.queueWaitTime, 0) / completed.length).toFixed(1)
    : '0.0';

  container.innerHTML = `
    <div class="flex justify-between"><span>仿真时间</span><span class="font-bold">${e.currentTime.toFixed(1)} / ${e.config.totalDuration}分</span></div>
    <div class="flex justify-between"><span>已到达</span><span class="font-bold text-blue-600">${e.getTotalArrived()}</span></div>
    <div class="flex justify-between"><span>排队中</span><span class="font-bold text-orange-600">${e.getTotalQueuing()}</span></div>
    <div class="flex justify-between"><span>打饭中</span><span class="font-bold text-yellow-600">${serving}</span></div>
    <div class="flex justify-between"><span>等座位</span><span class="font-bold text-amber-600">${waitSeat}</span></div>
    <div class="flex justify-between"><span>就餐中</span><span class="font-bold text-blue-600">${eating}</span></div>
    <div class="flex justify-between"><span>离开中</span><span class="font-bold text-gray-500">${leaving}</span></div>
    <div class="flex justify-between"><span>已离开</span><span class="font-bold text-green-600">${e.getTotalServed()}</span></div>
    <div class="mt-1 pt-1 border-t flex justify-between"><span>平均排队时长</span><span class="font-bold text-red-600">${avgQueue}分</span></div>
    <div class="flex justify-between text-gray-400"><span>窗口状态</span><span>${e.windows.map(w => w.isBusy ? '🔴' : '🟢').join(' ')}</span></div>
  `;
}

function showResult(): void {
  const section = document.getElementById('result-section');
  const container = document.getElementById('single-result');
  if (!section || !container) return;

  section.classList.remove('hidden');
  const result = engine.computeResult();
  renderSingleResult(container, result);
}

// ======================== 批量仿真 ========================

function runBatchAnalysis(): void {
  const loading = document.getElementById('batch-loading');
  const resultDiv = document.getElementById('batch-result');
  const btn = document.getElementById('btn-batch') as HTMLButtonElement;

  if (!resultDiv) return;

  // 立即让容器可见（关键：Chart.js 需要容器可见才能获取 canvas 尺寸）
  resultDiv.classList.remove('hidden');
  if (loading) loading.classList.remove('hidden');
  btn.disabled = true;

  const config = readConfig();

  // 批量仿真参数：3种人流×4种窗口配置=12组仿真
  // 使用5/10/15覆盖从欠载到超载的场景
  const batchParams: BatchParams = {
    windowCounts: [3, 4, 5, 6],
    arrivalRates: [5, 10, 15],
    totalDuration: config.totalDuration,
    seatCount: config.seatCount,
    serveTime: config.serveTime,
    eatTime: config.eatTime,
  };

  // runAndRenderBatch 内部自行管理进度和结果渲染
  // 仿真完成后回调以恢复按钮状态
  runAndRenderBatch(resultDiv, batchParams, () => {
    if (loading) loading.classList.add('hidden');
    btn.disabled = false;
  });
}
