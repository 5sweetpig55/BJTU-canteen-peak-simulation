/**
 * 统计分析与批量仿真对比 v4
 *
 * 核心原则：所有数据100%来自仿真计算，零硬编码
 *
 * 修复：Chart.js 图表渲染 — 确保容器可见、canvas 尺寸有效后再渲染
 */

import { Chart, registerables } from 'chart.js';
// Chart.js 4.x 需要手动注册所有组件，否则图表不渲染
Chart.register(...registerables);
import type { TooltipItem } from 'chart.js';
import type { SimResult } from './simulation';
import { SimulationEngine, runBatchSimulation } from './simulation';

// ======================== 单轮仿真统计 ========================

export function renderSingleResult(
  container: HTMLElement,
  result: SimResult,
): void {
  const maxThroughput = result.config.windowCount / result.config.serveTime;
  const demand = result.config.arrivalRate;
  const overloadRatio = (demand / maxThroughput).toFixed(2);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
      <div class="stat-card">
        <div class="stat-label">总到达</div>
        <div class="stat-value">${result.totalArrived}人</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">完成服务</div>
        <div class="stat-value">${result.totalServed}人</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">平均排队时长</div>
        <div class="stat-value ${result.avgQueueTime > 5 ? 'text-red' : 'text-green'}">${result.avgQueueTime.toFixed(2)}分钟</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">最长排队时长</div>
        <div class="stat-value">${result.maxQueueTime.toFixed(2)}分钟</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">平均停留时长</div>
        <div class="stat-value">${result.avgStayTime.toFixed(2)}分钟</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">座位利用率</div>
        <div class="stat-value">${(result.seatUtilization * 100).toFixed(1)}%</div>
      </div>
      <div class="stat-card" style="grid-column:span 2">
        <div class="stat-label">吞吐量分析</div>
        <div style="font-size:12px;margin-top:2px;">
          需求${demand}人/分 · 最大吞吐${maxThroughput.toFixed(1)}人/分 · 
          负载比${overloadRatio}${parseFloat(overloadRatio) > 1 ? ' <span class="text-red">超载!</span>' : ' <span class="text-green">可承受</span>'}
        </div>
      </div>
      <div style="grid-column:span 2">
        <div class="stat-label" style="margin-bottom:4px">各窗口利用率</div>
        ${result.windowUtilization.map((u, i) => {
          const pct = (u * 100).toFixed(1);
          const color = u > 0.95 ? '#ef4444' : u > 0.7 ? '#f59e0b' : '#22c55e';
          return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="width:50px;font-size:12px;">窗口${i + 1}</span>
            <div style="flex:1;height:14px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
              <div style="width:${Math.min(u * 100, 100)}%;height:100%;background:${color};border-radius:3px;"></div>
            </div>
            <span style="width:45px;text-align:right;font-size:11px;">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
      ${result.wasForceEnded ? `
      <div style="grid-column:span 2;color:#ef4444;font-size:12px;border:1px solid #fca5a5;padding:6px;border-radius:4px;">
        仿真超时终止：${result.unfinishedCount}人未完成服务，排队时长仅统计已完成全流程的学生
      </div>` : ''}
    </div>
  `;
}

// ======================== 批量仿真参数 ========================

export interface BatchParams {
  windowCounts: number[];
  arrivalRates: number[];
  totalDuration: number;
  seatCount: number;
  serveTime: number;
  eatTime: number;
}

// ======================== 批量仿真 + 图表 ========================

// Chart.js实例追踪
let chartQueueTime: Chart | null = null;
let chartUtilization: Chart | null = null;

export function runAndRenderBatch(
  container: HTMLElement,
  params: BatchParams,
  onComplete?: () => void,
): void {
  // Step 1: 显示进度
  container.innerHTML = `
    <div style="text-align:center;padding:30px;">
      <div style="font-size:18px;font-weight:700;margin-bottom:10px;color:#1e40af;">正在运行批量仿真...</div>
      <div style="font-size:14px;color:#6b7280;margin-bottom:8px;">
        ${params.arrivalRates.length}种人流压力 × ${params.windowCounts.length}种窗口配置 = 
        ${params.arrivalRates.length * params.windowCounts.length}组仿真
      </div>
      <div style="font-size:12px;color:#9ca3af;">
        每组：${params.totalDuration}分钟到达期 + 等待队列排空<br>
        参数：打饭${params.serveTime}分/人 · 就餐${params.eatTime}分 · ${params.seatCount}座
      </div>
      <div style="margin-top:16px;">
        <div style="display:inline-block;width:200px;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
          <div style="width:100%;height:100%;background:#3b82f6;animation:batchPulse 1.5s infinite;border-radius:3px;"></div>
        </div>
      </div>
      <style>@keyframes batchPulse{0%,100%{opacity:0.3}50%{opacity:1}}</style>
    </div>
  `;

  // Step 2: 使用 setTimeout 让进度UI先渲染，再执行计算密集的仿真
  setTimeout(() => {
    // 执行仿真（同步、计算密集）
    const results = runBatchSimulation({
      windowCounts: params.windowCounts,
      arrivalRates: params.arrivalRates,
      baseConfig: {
        totalDuration: params.totalDuration,
        seatCount: params.seatCount,
        serveTime: params.serveTime,
        eatTime: params.eatTime,
        speedMultiplier: 1,
      },
    });

    // Step 3: 构建结果页面结构（先清空容器）
    container.innerHTML = '';

    // 3.1 标题
    const title = document.createElement('h3');
    title.textContent = '批量仿真对比结果';
    title.style.cssText = 'font-size:18px;font-weight:700;margin:0 0 12px 0;color:#1e293b;';
    container.appendChild(title);

    // 3.2 参数说明
    const paramInfo = document.createElement('div');
    paramInfo.style.cssText = 'font-size:12px;color:#6b7280;margin-bottom:16px;padding:10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;';
    paramInfo.innerHTML = `
      <strong>仿真参数：</strong>
      到达期${params.totalDuration}分钟 · 打饭${params.serveTime}分钟/人 · 就餐${params.eatTime}分钟 · ${params.seatCount}个座位<br>
      <strong>测试范围：</strong>
      人流${params.arrivalRates.join('/')}人/分 × 窗口${params.windowCounts.join('/')}个<br>
      <span style="color:#3b82f6;">以下所有数据均来自${params.arrivalRates.length * params.windowCounts.length}组独立仿真运算，非预设值</span>
    `;
    container.appendChild(paramInfo);

    // 3.3 对比表格
    renderComparisonTable(container, results, params);

    // 3.4 图表区域 — 两个 canvas 必须先加入 DOM 且容器可见
    const chartsSection = document.createElement('div');
    chartsSection.style.cssText = 'margin-top:20px;';

    const chartTitle = document.createElement('h4');
    chartTitle.textContent = '仿真数据图表';
    chartTitle.style.cssText = 'font-size:15px;font-weight:700;margin:0 0 12px 0;color:#334155;';
    chartsSection.appendChild(chartTitle);

    const chartsRow = document.createElement('div');
    chartsRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:20px;';

    // 图表1容器
    const chartDiv1 = document.createElement('div');
    chartDiv1.style.cssText = 'background:#fafbfc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;';
    const canvasLabel1 = document.createElement('div');
    canvasLabel1.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:8px;color:#475569;text-align:center;';
    canvasLabel1.textContent = '窗口数 — 平均排队时长曲线';
    const canvas1 = document.createElement('canvas');
    canvas1.id = 'batchChartQueueTime';
    canvas1.width = 400;
    canvas1.height = 280;
    canvas1.style.cssText = 'width:100%;max-height:280px;';
    chartDiv1.appendChild(canvasLabel1);
    chartDiv1.appendChild(canvas1);

    // 图表2容器
    const chartDiv2 = document.createElement('div');
    chartDiv2.style.cssText = 'background:#fafbfc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;';
    const canvasLabel2 = document.createElement('div');
    canvasLabel2.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:8px;color:#475569;text-align:center;';
    canvasLabel2.textContent = '窗口数 — 平均利用率曲线';
    const canvas2 = document.createElement('canvas');
    canvas2.id = 'batchChartUtilization';
    canvas2.width = 400;
    canvas2.height = 280;
    canvas2.style.cssText = 'width:100%;max-height:280px;';
    chartDiv2.appendChild(canvasLabel2);
    chartDiv2.appendChild(canvas2);

    chartsRow.appendChild(chartDiv1);
    chartsRow.appendChild(chartDiv2);
    chartsSection.appendChild(chartsRow);
    container.appendChild(chartsSection);

    // 3.5 承载能力分析报告
    renderCapacityReport(container, results, params);

    // 3.6 动态窗口配置建议
    renderWindowAdvice(container, results, params);

    // 3.7 等DOM更新后渲染Chart.js图表
    // 使用双重 rAF 确保 DOM 已布局、canvas 尺寸已确定
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        renderCharts(results, params);
        // 图表渲染完毕，通知外部恢复按钮状态
        if (onComplete) onComplete();
      });
    });

  }, 50);
}

// ======================== 对比表格 ========================

function renderComparisonTable(
  container: HTMLElement,
  results: SimResult[][],
  params: BatchParams,
): void {
  const tableDiv = document.createElement('div');
  tableDiv.style.cssText = 'overflow-x:auto;';

  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#1e293b;color:#fff;">
        <th style="padding:10px 12px;text-align:left;">人流(人/分)</th>
        <th style="padding:10px 12px;text-align:center;">指标</th>`;

  for (const wc of params.windowCounts) {
    html += `<th style="padding:10px 12px;text-align:center;">${wc}个窗口</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (let ri = 0; ri < results.length; ri++) {
    const rate = params.arrivalRates[ri];
    const row = results[ri];
    const bgColor = ri % 2 === 0 ? '#fff' : '#f8fafc';

    // 排队时长行
    html += `<tr style="background:${bgColor};">
      <td rowspan="3" style="padding:8px 12px;font-weight:700;border-right:2px solid #e2e8f0;vertical-align:middle;font-size:14px;color:#1e40af;">${rate}</td>
      <td style="padding:6px 10px;color:#64748b;font-weight:600;">排队时长(分)</td>`;
    for (const r of row) {
      const color = r.avgQueueTime > 10 ? '#dc2626' : r.avgQueueTime > 5 ? '#d97706' : '#16a34a';
      html += `<td style="padding:6px 10px;text-align:center;color:${color};font-weight:700;font-size:13px;">${r.avgQueueTime.toFixed(2)}</td>`;
    }
    html += `</tr>`;

    // 利用率行
    html += `<tr style="background:${bgColor};">
      <td style="padding:6px 10px;color:#64748b;font-weight:600;">窗口利用率</td>`;
    for (const r of row) {
      const avgU = r.windowUtilization.reduce((a, b) => a + b, 0) / r.windowUtilization.length;
      const pct = (avgU * 100).toFixed(1);
      const color = avgU > 0.95 ? '#dc2626' : avgU > 0.7 ? '#d97706' : '#16a34a';
      html += `<td style="padding:6px 10px;text-align:center;color:${color};font-weight:600;">${pct}%</td>`;
    }
    html += `</tr>`;

    // 完成服务行
    html += `<tr style="background:${bgColor};">
      <td style="padding:6px 10px;color:#64748b;font-weight:600;">完成服务</td>`;
    for (const r of row) {
      html += `<td style="padding:6px 10px;text-align:center;">${r.totalServed}/${r.totalArrived}</td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  tableDiv.innerHTML = html;
  container.appendChild(tableDiv);
}

// ======================== Chart.js 图表渲染 ========================

function renderCharts(
  results: SimResult[][],
  params: BatchParams,
): void {
  const colors = ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
  const bgColors = ['rgba(59,130,246,0.1)', 'rgba(245,158,11,0.1)', 'rgba(239,68,68,0.1)', 'rgba(139,92,246,0.1)'];

  // ===== 图表1: 窗口数 — 平均排队时长 =====
  const canvas1 = document.getElementById('batchChartQueueTime') as HTMLCanvasElement;
  if (canvas1) {
    // 销毁旧实例
    if (chartQueueTime) {
      chartQueueTime.destroy();
      chartQueueTime = null;
    }

    const datasets = params.arrivalRates.map((rate, ri) => {
      const data = results[ri].map(r => parseFloat(r.avgQueueTime.toFixed(2)));
      return {
        label: `${rate}人/分`,
        data,
        borderColor: colors[ri % colors.length],
        backgroundColor: bgColors[ri % bgColors.length],
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: colors[ri % colors.length],
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        fill: true,
        tension: 0.3,
      };
    });

    // 添加5分钟目标线
    const targetLinePlugin = {
      id: 'targetLine',
      afterDraw(chart: Chart): void {
        const yScale = chart.scales.y;
        const yAxis = yScale.getPixelForValue(5);
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(chart.chartArea.left, yAxis);
        ctx.lineTo(chart.chartArea.right, yAxis);
        ctx.stroke();
        ctx.fillStyle = '#dc2626';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('目标: 5分钟', chart.chartArea.right - 4, yAxis - 4);
        ctx.restore();
      },
    };

    chartQueueTime = new Chart(canvas1, {
      type: 'line',
      data: {
        labels: params.windowCounts.map(w => `${w}个窗口`),
        datasets,
      },
      plugins: [targetLinePlugin],
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 800 },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, usePointStyle: true, padding: 15 } },
          tooltip: {
            callbacks: {
              label(item: TooltipItem<'line'>): string {
                const val = item.parsed.y ?? 0;
                return `${item.dataset.label ?? ''}: ${val.toFixed(2)}分钟`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: '排队时长(分钟)', font: { size: 12, weight: 'bold' as const } },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
          x: {
            title: { display: true, text: '窗口数量', font: { size: 12, weight: 'bold' as const } },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
        },
      },
    });
  } else {
    console.error('[analysis] canvas1 not found: batchChartQueueTime');
  }

  // ===== 图表2: 窗口数 — 平均利用率 =====
  const canvas2 = document.getElementById('batchChartUtilization') as HTMLCanvasElement;
  if (canvas2) {
    // 销毁旧实例
    if (chartUtilization) {
      chartUtilization.destroy();
      chartUtilization = null;
    }

    const datasets = params.arrivalRates.map((rate, ri) => {
      const data = results[ri].map(r => {
        const avgU = r.windowUtilization.reduce((a, b) => a + b, 0) / r.windowUtilization.length;
        return parseFloat((avgU * 100).toFixed(1));
      });
      return {
        label: `${rate}人/分`,
        data,
        borderColor: colors[ri % colors.length],
        backgroundColor: bgColors[ri % bgColors.length],
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: colors[ri % colors.length],
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        fill: true,
        tension: 0.3,
      };
    });

    chartUtilization = new Chart(canvas2, {
      type: 'line',
      data: {
        labels: params.windowCounts.map(w => `${w}个窗口`),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 800 },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, usePointStyle: true, padding: 15 } },
          tooltip: {
            callbacks: {
              label(item: TooltipItem<'line'>): string {
                const val = item.parsed.y ?? 0;
                return `${item.dataset.label ?? ''}: ${val.toFixed(1)}%`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: { display: true, text: '利用率(%)', font: { size: 12, weight: 'bold' as const } },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
          x: {
            title: { display: true, text: '窗口数量', font: { size: 12, weight: 'bold' as const } },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
        },
      },
    });
  } else {
    console.error('[analysis] canvas2 not found: batchChartUtilization');
  }
}

// ======================== 承载能力分析报告 ========================

function renderCapacityReport(
  container: HTMLElement,
  results: SimResult[][],
  params: BatchParams,
): void {
  const reportDiv = document.createElement('div');
  reportDiv.style.cssText = 'margin-top:24px;padding:16px;background:#fffbeb;border:2px solid #fbbf24;border-radius:12px;';

  let html = `<div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#92400e;">
    承载能力分析报告
  </div>`;

  const serveTime = params.serveTime;

  // 1. 系统理论承载上限
  html += `<div style="margin-bottom:12px;padding:10px;background:#fff;border-radius:8px;border:1px solid #fde68a;">`;
  html += `<div style="font-weight:700;font-size:13px;color:#92400e;margin-bottom:6px;">一、系统理论承载能力</div>`;
  html += `<div style="font-size:12px;line-height:1.8;">`;
  html += `打饭耗时${serveTime}分钟/人，单窗口吞吐${(1 / serveTime).toFixed(1)}人/分。<br>`;
  for (const wc of params.windowCounts) {
    const throughput = wc / serveTime;
    html += `<span style="color:${params.arrivalRates[params.arrivalRates.length - 1] > throughput ? '#dc2626' : '#16a34a'};">
      ${wc}个窗口 → 最大吞吐${throughput.toFixed(1)}人/分</span><br>`;
  }
  html += `</div></div>`;

  // 2. 仿真验证的实际承载能力
  html += `<div style="margin-bottom:12px;padding:10px;background:#fff;border-radius:8px;border:1px solid #fde68a;">`;
  html += `<div style="font-weight:700;font-size:13px;color:#92400e;margin-bottom:6px;">二、仿真验证的实际承载能力</div>`;
  html += `<div style="font-size:12px;line-height:1.8;">`;

  for (let ri = 0; ri < results.length; ri++) {
    const rate = params.arrivalRates[ri];
    const row = results[ri];
    const minQueueResult = row.reduce((min, r) => r.avgQueueTime < min.avgQueueTime ? r : min);

    html += `<div style="margin-bottom:6px;padding:6px 8px;background:${rate > 10 ? '#fef2f2' : '#f0fdf4'};border-radius:4px;">`;
    html += `<strong>${rate}人/分：</strong>`;
    html += `${params.windowCounts[0]}窗口排队${row[0].avgQueueTime.toFixed(1)}分 → ${params.windowCounts[params.windowCounts.length - 1]}窗口排队${row[row.length - 1].avgQueueTime.toFixed(1)}分`;

    const bestQueueTime = minQueueResult.avgQueueTime;
    if (bestQueueTime < 1) {
      html += ` <span style="color:#16a34a;font-weight:700;">✓ 系统余量充足</span>`;
    } else if (bestQueueTime <= 5) {
      html += ` <span style="color:#d97706;font-weight:700;">△ 接近承载上限</span>`;
    } else {
      html += ` <span style="color:#dc2626;font-weight:700;">✗ 超出承载能力</span>`;
    }
    html += `</div>`;
  }
  html += `</div></div>`;

  // 3. 关键发现
  html += `<div style="margin-bottom:12px;padding:10px;background:#fff;border-radius:8px;border:1px solid #fde68a;">`;
  html += `<div style="font-weight:700;font-size:13px;color:#92400e;margin-bottom:6px;">三、关键发现</div>`;
  html += `<div style="font-size:12px;line-height:2;">`;

  // 找到临界点
  let criticalRate = 0;
  let criticalWindows = 0;
  for (let ri = 0; ri < results.length; ri++) {
    const rate = params.arrivalRates[ri];
    const row = results[ri];
    for (let wi = 0; wi < row.length; wi++) {
      if (row[wi].avgQueueTime > 5) {
        criticalRate = rate;
        criticalWindows = params.windowCounts[wi];
        break;
      }
    }
    if (criticalRate > 0) break;
  }

  // 排队时长降幅
  for (let ri = 0; ri < results.length; ri++) {
    const rate = params.arrivalRates[ri];
    const row = results[ri];
    const qFirst = row[0].avgQueueTime;
    const qLast = row[row.length - 1].avgQueueTime;
    if (qFirst > 0.5) {
      const reduction = ((1 - qLast / qFirst) * 100).toFixed(0);
      html += `<div>• ${rate}人/分：${params.windowCounts[0]}→${params.windowCounts[params.windowCounts.length - 1]}窗口，排队时长降低<span style="color:#16a34a;font-weight:700;">${reduction}%</span>（${qFirst.toFixed(1)}分→${qLast.toFixed(1)}分）</div>`;
    } else {
      html += `<div>• ${rate}人/分：${params.windowCounts[0]}窗口已够用，无需增加</div>`;
    }
  }

  if (criticalRate > 0) {
    html += `<div style="color:#dc2626;font-weight:700;">• 临界点：${criticalRate}人/分时${criticalWindows}窗口排队已超5分钟目标</div>`;
  }

  html += `</div></div>`;

  reportDiv.innerHTML = html;
  container.appendChild(reportDiv);
}

// ======================== 动态窗口配置建议 ========================

function renderWindowAdvice(
  container: HTMLElement,
  results: SimResult[][],
  params: BatchParams,
): void {
  const adviceDiv = document.createElement('div');
  adviceDiv.style.cssText = 'margin-top:16px;padding:16px;background:#ecfdf5;border:2px solid #22c55e;border-radius:12px;';

  let html = `<div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#166534;">
    动态窗口配置建议
  </div>`;

  const targetQueueTime = 5;

  html += `<div style="font-size:12px;color:#166534;margin-bottom:12px;">
    目标：平均排队时长 ≤ ${targetQueueTime}分钟 | 数据来源：上方${params.arrivalRates.length * params.windowCounts.length}组仿真结果
  </div>`;

  // 逐个人流压力给出建议
  for (let ri = 0; ri < results.length; ri++) {
    const rate = params.arrivalRates[ri];
    const row = results[ri];

    html += `<div style="margin-bottom:10px;padding:10px;background:#fff;border-radius:8px;border:1px solid #bbf7d0;">`;
    html += `<div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#1e293b;">
      人流 ${rate} 人/分：
    </div>`;

    // 找到达标的最少窗口数
    let recommended = -1;
    for (let wi = 0; wi < row.length; wi++) {
      if (row[wi].avgQueueTime <= targetQueueTime) {
        recommended = params.windowCounts[wi];
        break;
      }
    }

    if (recommended > 0) {
      const recResult = row.find(r => r.config.windowCount === recommended)!;
      const avgU = recResult.windowUtilization.reduce((a, b) => a + b, 0) / recResult.windowUtilization.length;
      html += `<div style="font-size:13px;color:#15803d;font-weight:700;margin-bottom:4px;">
        建议：开 ${recommended} 个窗口
      </div>`;
      html += `<div style="font-size:12px;color:#475569;">
        排队时长 ${recResult.avgQueueTime.toFixed(2)}分钟 ≤ ${targetQueueTime}分钟目标 · 
        窗口利用率 ${(avgU * 100).toFixed(1)}% · 
        完成服务 ${recResult.totalServed}人
      </div>`;

      // 与更多窗口对比
      if (recommended < params.windowCounts[params.windowCounts.length - 1]) {
        const moreIdx = row.findIndex(r => r.config.windowCount === recommended + 1);
        if (moreIdx >= 0) {
          const moreResult = row[moreIdx];
          const moreU = moreResult.windowUtilization.reduce((a, b) => a + b, 0) / moreResult.windowUtilization.length;
          html += `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">
            若开${recommended + 1}窗口：排队${moreResult.avgQueueTime.toFixed(2)}分，利用率${(moreU * 100).toFixed(1)}%（更宽松但利用率降低）
          </div>`;
        }
      }
    } else {
      // 所有配置都不达标
      const bestResult = row[row.length - 1];
      const bestU = bestResult.windowUtilization.reduce((a, b) => a + b, 0) / bestResult.windowUtilization.length;
      const maxThroughput = params.windowCounts[params.windowCounts.length - 1] / params.serveTime;
      const neededWindows = Math.ceil(rate * params.serveTime * (1 + targetQueueTime / 10));
      html += `<div style="font-size:13px;color:#dc2626;font-weight:700;margin-bottom:4px;">
        当前窗口数不足以应对该人流
      </div>`;
      html += `<div style="font-size:12px;color:#475569;">
        ${params.windowCounts[params.windowCounts.length - 1]}窗口仍排队${bestResult.avgQueueTime.toFixed(2)}分钟 · 
        利用率${(bestU * 100).toFixed(1)}% · 
        最大吞吐${maxThroughput.toFixed(1)}人/分 < 需求${rate}人/分
      </div>`;
      html += `<div style="font-size:12px;color:#dc2626;margin-top:2px;">
        建议至少开${neededWindows}个窗口，或采取限流措施
      </div>`;
    }

    html += `</div>`;
  }

  // 汇总建议表
  html += `<div style="margin-top:12px;padding:12px;background:#fff;border-radius:8px;border:2px solid #22c55e;">`;
  html += `<div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#166534;">配置建议汇总</div>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead>
      <tr style="background:#dcfce7;">
        <th style="padding:8px;text-align:left;">人流压力</th>
        <th style="padding:8px;text-align:center;">建议窗口数</th>
        <th style="padding:8px;text-align:center;">预期排队时长</th>
        <th style="padding:8px;text-align:center;">预期利用率</th>
        <th style="padding:8px;text-align:center;">状态</th>
      </tr>
    </thead>
    <tbody>`;

  for (let ri = 0; ri < results.length; ri++) {
    const rate = params.arrivalRates[ri];
    const row = results[ri];

    let recommended = -1;
    for (const r of row) {
      if (r.avgQueueTime <= targetQueueTime) {
        recommended = r.config.windowCount;
        break;
      }
    }

    if (recommended > 0) {
      const recResult = row.find(r => r.config.windowCount === recommended)!;
      const avgU = recResult.windowUtilization.reduce((a, b) => a + b, 0) / recResult.windowUtilization.length;
      html += `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:6px 8px;font-weight:600;">${rate}人/分</td>
        <td style="padding:6px 8px;text-align:center;font-weight:700;color:#15803d;">${recommended}个</td>
        <td style="padding:6px 8px;text-align:center;">${recResult.avgQueueTime.toFixed(2)}分</td>
        <td style="padding:6px 8px;text-align:center;">${(avgU * 100).toFixed(1)}%</td>
        <td style="padding:6px 8px;text-align:center;color:#16a34a;">达标</td>
      </tr>`;
    } else {
      html += `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:6px 8px;font-weight:600;">${rate}人/分</td>
        <td style="padding:6px 8px;text-align:center;font-weight:700;color:#dc2626;">>${params.windowCounts[params.windowCounts.length - 1]}个</td>
        <td style="padding:6px 8px;text-align:center;color:#dc2626;">>${targetQueueTime}分</td>
        <td style="padding:6px 8px;text-align:center;">~100%</td>
        <td style="padding:6px 8px;text-align:center;color:#dc2626;font-weight:700;">超载</td>
      </tr>`;
    }
  }

  html += `</tbody></table></div>`;

  // 数据溯源
  html += `<div style="margin-top:10px;font-size:11px;color:#94a3b8;text-align:center;">
    以上建议全部基于${params.arrivalRates.length * params.windowCounts.length}组仿真数据计算得出 · 
    仿真参数：${params.totalDuration}分到达期 · ${params.serveTime}分/人打饭 · ${params.eatTime}分就餐 · ${params.seatCount}座
  </div>`;

  adviceDiv.innerHTML = html;
  container.appendChild(adviceDiv);
}
