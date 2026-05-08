/**
 * 食堂仿真 Canvas 2D 可视化渲染器
 * 重新设计布局：入口→排队区（蛇形队列）→窗口→等待/就餐区→出口
 * 解决重叠：限制可视Agent数、增大间距、清晰区域划分
 */

import { SimulationEngine, AgentState, StudentAgent } from './simulation';

// ======================== 布局常量 ========================

interface LayoutConfig {
  canvasWidth: number;
  canvasHeight: number;
  // 入口
  entranceX: number;
  entranceY: number;
  // 排队区域
  queueAreaLeft: number;
  queueAreaRight: number;
  queueAreaTop: number;
  queueAreaBottom: number;
  // 窗口
  windowX: number;
  windowStartY: number;
  windowSpacingY: number;
  // 等座位区域
  waitAreaX: number;
  waitAreaY: number;
  // 座位区
  seatAreaLeft: number;
  seatAreaTop: number;
  seatCols: number;
  seatCellW: number;
  seatCellH: number;
  // 出口
  exitX: number;
  exitY: number;
  // Agent
  agentRadius: number;
}

function computeLayout(
  canvasWidth: number,
  canvasHeight: number,
  windowCount: number,
  seatCount: number
): LayoutConfig {
  const agentRadius = 5;

  // 区域划分：左1/3排队，中间1/3窗口+等位，右1/3就餐
  const col1 = canvasWidth * 0.30;  // 排队区右边界
  const col2 = canvasWidth * 0.55;  // 窗口区右边界
  const col3 = canvasWidth * 0.95;  // 座位区右边界

  const margin = 30;
  const windowSpacingY = Math.min(80, (canvasHeight - 120) / Math.max(windowCount, 1));
  const windowStartY = margin + 30;

  const seatCols = Math.max(3, Math.ceil(Math.sqrt(seatCount * 0.8)));
  const seatCellW = Math.min(42, (col3 - col2 - 20) / seatCols);
  const seatCellH = Math.min(42, (canvasHeight - 100) / Math.ceil(seatCount / seatCols));

  return {
    canvasWidth,
    canvasHeight,
    entranceX: col1 / 2,
    entranceY: margin,
    queueAreaLeft: margin,
    queueAreaRight: col1 - 10,
    queueAreaTop: margin + 20,
    queueAreaBottom: canvasHeight - margin - 30,
    windowX: (col1 + col2) / 2,
    windowStartY,
    windowSpacingY,
    waitAreaX: col2 - 40,
    waitAreaY: canvasHeight - 60,
    seatAreaLeft: col2 + 10,
    seatAreaTop: margin + 25,
    seatCols,
    seatCellW,
    seatCellH,
    exitX: canvasWidth / 2,
    exitY: canvasHeight - margin / 2,
    agentRadius,
  };
}

// ======================== 渲染器 ========================

export class CafeteriaRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layout!: LayoutConfig;
  private engine: SimulationEngine;

  constructor(canvas: HTMLCanvasElement, engine: SimulationEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.engine = engine;
    this.updateLayout();
  }

  updateLayout(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    this.canvas.width = w * window.devicePixelRatio;
    this.canvas.height = h * window.devicePixelRatio;
    this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    this.layout = computeLayout(w, h, this.engine.config.windowCount, this.engine.config.seatCount);
  }

  setEngine(engine: SimulationEngine): void {
    this.engine = engine;
    this.updateLayout();
  }

  /** 计算Agent目标位置 */
  private getAgentTargetPos(agent: StudentAgent): { x: number; y: number } {
    const L = this.layout;

    if (agent.state === AgentState.QUEUING) {
      // 蛇形排列：每个窗口一列，队列向下延伸
      const wy = L.windowStartY + agent.windowIndex * L.windowSpacingY;
      const maxVisible = 15;
      const pos = Math.min(agent.queuePosition, maxVisible);
      if (agent.queuePosition > maxVisible) {
        // 溢出的挤在最末尾位置（带偏移）
        const overflow = agent.queuePosition - maxVisible;
        return {
          x: L.queueAreaLeft + 8 + (overflow % 3) * (L.agentRadius * 2 + 2),
          y: wy + 15 + pos * (L.agentRadius * 2 + 2) + Math.floor(overflow / 3) * 2,
        };
      }
      return {
        x: L.queueAreaLeft + 12 + agent.queuePosition * (L.agentRadius * 2 + 3),
        y: wy,
      };
    }

    if (agent.state === AgentState.SERVING) {
      const wy = L.windowStartY + agent.windowIndex * L.windowSpacingY;
      return { x: L.windowX + 18, y: wy };
    }

    if (agent.state === AgentState.WAITING_FOR_SEAT) {
      // 等座位区域：在窗口右侧偏下
      const idx = this.engine.getSeatWaitAgents().indexOf(agent);
      const row = Math.floor(idx / 6);
      const col = idx % 6;
      return {
        x: L.waitAreaX + col * 14,
        y: L.waitAreaY - row * 14,
      };
    }

    if (agent.state === AgentState.WALKING_TO_SEAT) {
      if (agent.seatIndex >= 0) {
        return this.getSeatPosition(agent.seatIndex);
      }
      const wy = L.windowStartY + agent.windowIndex * L.windowSpacingY;
      return { x: L.windowX + 40, y: wy + 15 };
    }

    if (agent.state === AgentState.EATING) {
      return this.getSeatPosition(agent.seatIndex);
    }

    if (agent.state === AgentState.LEAVING) {
      return { x: L.exitX, y: L.exitY };
    }

    // ARRIVING
    return { x: L.entranceX, y: L.entranceY + 30 };
  }

  /** 获取座位坐标 */
  private getSeatPosition(seatIndex: number): { x: number; y: number } {
    const L = this.layout;
    const col = seatIndex % L.seatCols;
    const row = Math.floor(seatIndex / L.seatCols);
    return {
      x: L.seatAreaLeft + col * L.seatCellW + L.seatCellW / 2,
      y: L.seatAreaTop + row * L.seatCellH + L.seatCellH / 2,
    };
  }

  /** 更新Agent动画位置（平滑移动） */
  updateAgentPositions(dtMs: number): void {
    const speed = 250;
    const factor = Math.min(1, speed * dtMs / 1000);

    for (const agent of this.engine.agents) {
      if (agent.state === AgentState.LEFT) continue;

      const target = this.getAgentTargetPos(agent);
      agent.targetX = target.x;
      agent.targetY = target.y;

      if (agent.x === 0 && agent.y === 0) {
        agent.x = this.layout.entranceX;
        agent.y = this.layout.entranceY + 20;
      }

      agent.x += (agent.targetX - agent.x) * factor;
      agent.y += (agent.targetY - agent.y) * factor;
    }
  }

  /** 渲染完整场景 */
  render(): void {
    const ctx = this.ctx;
    const L = this.layout;
    const w = L.canvasWidth;
    const h = L.canvasHeight;

    ctx.clearRect(0, 0, w, h);

    this.drawBackground(ctx, w, h);
    this.drawZoneLabels(ctx);
    this.drawEntrance(ctx);
    this.drawWindows(ctx);
    this.drawWaitArea(ctx);
    this.drawSeats(ctx);
    this.drawExit(ctx);
    this.drawAgents(ctx);
    this.drawHUD(ctx, w);
  }

  /** 背景：分区着色 */
  private drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const L = this.layout;
    const col1 = L.queueAreaRight + 10;
    const col2 = L.seatAreaLeft - 5;

    // 排队区背景
    ctx.fillStyle = '#fef9ee';
    ctx.fillRect(10, 10, col1 - 10, h - 20);

    // 窗口区背景
    ctx.fillStyle = '#fef3e2';
    ctx.fillRect(col1, 10, col2 - col1, h - 20);

    // 就餐区背景
    ctx.fillStyle = '#eef6ee';
    ctx.fillRect(col2, 10, w - col2 - 10, h - 20);

    // 分割线
    ctx.strokeStyle = '#d4c5a9';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(col1, 10);
    ctx.lineTo(col1, h - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(col2, 10);
    ctx.lineTo(col2, h - 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** 区域标签 */
  private drawZoneLabels(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    ctx.fillStyle = '#92714a';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('排队区', (L.queueAreaLeft + L.queueAreaRight) / 2, L.queueAreaTop - 5);
    ctx.fillText('打饭窗口', L.windowX, L.windowStartY - 15);
    ctx.fillText('就餐区', L.seatAreaLeft + (L.canvasWidth - L.seatAreaLeft) / 2, L.seatAreaTop - 5);
  }

  /** 入口 */
  private drawEntrance(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.roundRect(L.entranceX - 28, L.entranceY - 4, 56, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#166534';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('入口', L.entranceX, L.entranceY + 11);
  }

  /** 出口 */
  private drawExit(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.roundRect(L.exitX - 28, L.exitY - 10, 56, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#991b1b';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('出口', L.exitX, L.exitY + 5);
  }

  /** 窗口和队列引导 */
  private drawWindows(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;

    for (const w of this.engine.windows) {
      const wy = L.windowStartY + w.index * L.windowSpacingY;

      // 窗口本体
      const boxW = 54;
      const boxH = 32;
      const bx = L.windowX - boxW / 2;
      const by = wy - boxH / 2;

      // 窗口背景
      ctx.fillStyle = w.isBusy ? '#fde68a' : '#bbf7d0';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 8);
      ctx.fill();
      ctx.strokeStyle = w.isBusy ? '#b45309' : '#15803d';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 窗口编号和状态
      ctx.fillStyle = '#1c1917';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`W${w.index + 1}`, L.windowX, wy - 2);

      ctx.fillStyle = w.isBusy ? '#92400e' : '#166534';
      ctx.font = '9px sans-serif';
      ctx.fillText(w.isBusy ? '忙碌' : '空闲', L.windowX, wy + 10);

      // 队列方向箭头（从左到窗口）
      ctx.strokeStyle = '#c4a882';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(L.queueAreaLeft + 8, wy);
      ctx.lineTo(bx - 8, wy);
      ctx.stroke();
      ctx.setLineDash([]);

      // 队列人数
      if (w.queue.length > 0) {
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        const qLabelX = L.queueAreaLeft + 8 + Math.min(w.queue.length, 10) * 13 / 2;
        ctx.fillText(`${w.queue.length}人`, L.queueAreaLeft + 55, wy - 16);
      }
    }
  }

  /** 等座位区域 */
  private drawWaitArea(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    const waitCount = this.engine.getSeatWaitCount();
    if (waitCount === 0) return;

    ctx.fillStyle = '#92400e';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`等座位: ${waitCount}人`, L.waitAreaX - 60, L.waitAreaY + 20);
  }

  /** 座位 */
  private drawSeats(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    const seatR = Math.min(10, L.seatCellW / 2 - 4);

    for (const seat of this.engine.seats) {
      const pos = this.getSeatPosition(seat.index);

      // 桌子
      ctx.fillStyle = seat.occupied ? '#fed7aa' : '#e8e0d0';
      ctx.beginPath();
      ctx.roundRect(pos.x - seatR - 3, pos.y - seatR - 3, seatR * 2 + 6, seatR * 2 + 6, 5);
      ctx.fill();
      ctx.strokeStyle = seat.occupied ? '#c2410c' : '#a8997a';
      ctx.lineWidth = seat.occupied ? 1.5 : 1;
      ctx.stroke();

      if (!seat.occupied) {
        ctx.fillStyle = '#b8a88a';
        ctx.font = '7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${seat.index + 1}`, pos.x, pos.y + 3);
      }
    }
  }

  /** 绘制所有Agent */
  private drawAgents(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    const r = L.agentRadius;

    // 分层绘制：先画排队的，再画其他的，最后画正在服务的
    const layerOrder: AgentState[] = [
      AgentState.QUEUING,
      AgentState.WAITING_FOR_SEAT,
      AgentState.WALKING_TO_SEAT,
      AgentState.EATING,
      AgentState.SERVING,
      AgentState.LEAVING,
    ];

    for (const state of layerOrder) {
      for (const agent of this.engine.agents) {
        if (agent.state !== state) continue;

        const x = agent.x;
        const y = agent.y;
        ctx.save();

        if (agent.state === AgentState.QUEUING) {
          ctx.fillStyle = agent.color;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        } else if (agent.state === AgentState.SERVING) {
          const pulse = 1 + 0.2 * Math.sin(Date.now() / 120);
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#92400e';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (agent.state === AgentState.WAITING_FOR_SEAT) {
          // 等座位：灰色边框
          ctx.fillStyle = '#d4a574';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#7c2d12';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // 餐盘标记
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (agent.state === AgentState.WALKING_TO_SEAT) {
          ctx.fillStyle = '#60a5fa';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#1e40af';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (agent.state === AgentState.EATING) {
          ctx.fillStyle = '#3b82f6';
          ctx.beginPath();
          ctx.arc(x, y, r + 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#1e3a8a';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // 碗标记
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (agent.state === AgentState.LEAVING) {
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = '#9ca3af';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }
  }

  /** HUD信息 */
  private drawHUD(ctx: CanvasRenderingContext2D, canvasWidth: number): void {
    const engine = this.engine;
    const boxW = 195;
    const boxH = 175;
    const x = canvasWidth - boxW - 12;
    const y = 8;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 8);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';

    const lh = 19;
    let ly = y + 18;

    ctx.fillText(`仿真: ${engine.currentTime.toFixed(1)} / ${engine.config.totalDuration} 分`, x + 10, ly); ly += lh;
    ctx.fillText(`已到达: ${engine.getTotalArrived()} 人`, x + 10, ly); ly += lh;

    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`排队中: ${engine.getTotalQueuing()} 人`, x + 10, ly); ly += lh;

    ctx.fillStyle = '#fb923c';
    const serving = engine.agents.filter(a => a.state === AgentState.SERVING).length;
    ctx.fillText(`打饭中: ${serving} 人`, x + 10, ly); ly += lh;

    ctx.fillStyle = '#d4a574';
    ctx.fillText(`等座位: ${engine.getSeatWaitCount()} 人`, x + 10, ly); ly += lh;

    ctx.fillStyle = '#60a5fa';
    const eating = engine.agents.filter(a => a.state === AgentState.EATING).length;
    ctx.fillText(`就餐中: ${eating} 人`, x + 10, ly); ly += lh;

    ctx.fillStyle = '#4ade80';
    ctx.fillText(`已离开: ${engine.getTotalServed()} 人`, x + 10, ly); ly += lh;

    ly += 4;
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px monospace';
    const windowStatus = engine.windows.map(w => w.isBusy ? '忙' : '闲').join(' ');
    ctx.fillText(`窗口: [${windowStatus}]`, x + 10, ly);
  }
}
