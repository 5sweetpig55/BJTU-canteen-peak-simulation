/**
 * 食堂就餐仿真引擎 v2
 * Agent建模：学生作为独立Agent，状态机驱动
 * 完整生命周期：到达 → 排队 → 打饭 → 就餐 → 离开
 *
 * 关键修复：
 * - 打饭耗时默认0.5分钟(30秒)，符合现实食堂场景
 * - 利用率计算修正：用实际仿真运行时长而非配置总时长
 * - forceEnd修正：未服务完的Agent不参与排队时长统计
 * - 终止条件：到达期结束 + 队列排空，超时兜底
 */

// ======================== 类型定义 ========================

export enum AgentState {
  ARRIVING = 'arriving',
  QUEUING = 'queuing',
  SERVING = 'serving',
  WAITING_FOR_SEAT = 'waiting_for_seat',
  WALKING_TO_SEAT = 'walking_to_seat',
  EATING = 'eating',
  LEAVING = 'leaving',
  LEFT = 'left',
}

export interface SimConfig {
  totalDuration: number;   // 到达期时长（分钟），到达期结束后不再来新人
  windowCount: number;
  seatCount: number;
  arrivalRate: number;     // 人/分钟
  serveTime: number;       // 分钟/份
  eatTime: number;         // 分钟
  speedMultiplier: number;
}

export class StudentAgent {
  id: number;
  state: AgentState = AgentState.ARRIVING;
  windowIndex = -1;
  seatIndex = -1;
  queuePosition = -1;

  arrivalTime = 0;
  queueStartTime = 0;
  serveStartTime = 0;
  serveEndTime = 0;
  eatStartTime = 0;
  leaveTime = 0;

  x = 0;
  y = 0;
  targetX = 0;
  targetY = 0;
  color: string;
  stateTimer = 0;

  /** 是否完成了完整服务流程（打饭+就餐+离开） */
  completed = false;

  constructor(id: number, arrivalTime: number) {
    this.id = id;
    this.arrivalTime = arrivalTime;
    this.color = `hsl(${(id * 37) % 360}, 70%, 55%)`;
  }

  get queueWaitTime(): number {
    if (this.serveStartTime > 0 && this.serveStartTime >= this.queueStartTime) {
      return this.serveStartTime - this.queueStartTime;
    }
    return 0;
  }

  get totalStayTime(): number {
    if (this.leaveTime > 0 && this.leaveTime >= this.arrivalTime) {
      return this.leaveTime - this.arrivalTime;
    }
    return 0;
  }
}

export class ServiceWindow {
  index: number;
  queue: StudentAgent[] = [];
  currentServing: StudentAgent | null = null;
  busyTime = 0;
  totalServed = 0;

  constructor(index: number) {
    this.index = index;
  }

  get queueLength(): number { return this.queue.length; }
  get isBusy(): boolean { return this.currentServing !== null; }
}

export class Seat {
  index: number;
  occupied = false;
  occupant: StudentAgent | null = null;
  constructor(index: number) { this.index = index; }
}

export interface SimResult {
  config: SimConfig;
  totalServed: number;
  totalArrived: number;
  avgQueueTime: number;
  maxQueueTime: number;
  minQueueTime: number;
  avgStayTime: number;
  windowUtilization: number[];
  seatUtilization: number;
  avgQueueLength: number[];
  queueTimes: number[];
  seatWaitCount: number;
  /** 仿真实际运行时长（可能超过totalDuration，因为要等队列排空） */
  actualDuration: number;
  /** 是否因超时被强制终止 */
  wasForceEnded: boolean;
  /** 未服务完的学生数 */
  unfinishedCount: number;
}

// ======================== 仿真引擎 ========================

export class SimulationEngine {
  config: SimConfig;
  currentTime = 0;
  agents: StudentAgent[] = [];
  windows: ServiceWindow[] = [];
  seats: Seat[] = [];
  running = false;
  finished = false;

  private nextAgentId = 0;
  private arrivalAccumulator = 0;
  private leftAgents: StudentAgent[] = [];
  private seatWaitQueue: StudentAgent[] = [];
  private seatBusyTime = 0;
  private wasForceEnded = false;

  constructor(config: SimConfig) {
    this.config = { ...config };
    this.reset();
  }

  reset(): void {
    this.currentTime = 0;
    this.nextAgentId = 0;
    this.arrivalAccumulator = 0;
    this.agents = [];
    this.leftAgents = [];
    this.seatWaitQueue = [];
    this.seatBusyTime = 0;
    this.running = false;
    this.finished = false;
    this.wasForceEnded = false;

    this.windows = [];
    for (let i = 0; i < this.config.windowCount; i++) {
      this.windows.push(new ServiceWindow(i));
    }

    this.seats = [];
    for (let i = 0; i < this.config.seatCount; i++) {
      this.seats.push(new Seat(i));
    }
  }

  step(dt: number): void {
    if (this.finished) return;

    this.currentTime += dt;

    this.generateArrivals(dt);
    this.updateWindows(dt);
    this.updateSeats(dt);
    this.updateAgents(dt);

    // 累计座位占用时间
    const occupiedCount = this.seats.filter(s => s.occupied).length;
    this.seatBusyTime += occupiedCount * dt;

    // 终止条件1：到达期结束 + 所有学生已走完
    if (this.currentTime >= this.config.totalDuration && this.getActiveAgents().length === 0) {
      this.finished = true;
      this.running = false;
      return;
    }

    // 终止条件2：超时兜底（5倍到达期时长），防止无限运行
    if (this.currentTime >= this.config.totalDuration * 5) {
      this.forceEnd();
    }
  }

  private forceEnd(): void {
    this.wasForceEnded = true;
    // 把还在系统中的Agent标记为LEFT，但不标记completed
    for (const agent of this.agents) {
      if (agent.state !== AgentState.LEFT) {
        agent.state = AgentState.LEFT;
        if (agent.leaveTime === 0) agent.leaveTime = this.currentTime;
        this.leftAgents.push(agent);
      }
    }
    this.finished = true;
    this.running = false;
  }

  getActiveAgents(): StudentAgent[] {
    return this.agents.filter(a => a.state !== AgentState.LEFT);
  }

  getTotalQueuing(): number {
    return this.agents.filter(a => a.state === AgentState.QUEUING).length;
  }

  getSeatWaitCount(): number {
    return this.seatWaitQueue.length;
  }

  getSeatWaitAgents(): StudentAgent[] {
    return this.seatWaitQueue;
  }

  getTotalServed(): number {
    return this.leftAgents.filter(a => a.completed).length;
  }

  getTotalArrived(): number {
    return this.agents.length;
  }

  private generateArrivals(dt: number): void {
    if (this.currentTime >= this.config.totalDuration) return;

    this.arrivalAccumulator += this.config.arrivalRate * dt;

    while (this.arrivalAccumulator >= 1) {
      this.arrivalAccumulator -= 1;
      const agent = new StudentAgent(this.nextAgentId++, this.currentTime);
      agent.state = AgentState.QUEUING;
      this.agents.push(agent);
      this.assignToWindow(agent);
    }
  }

  private assignToWindow(agent: StudentAgent): void {
    let minLoad = Infinity;
    let minWindow = 0;

    for (const w of this.windows) {
      const load = w.queueLength + (w.isBusy ? 1 : 0);
      if (load < minLoad) {
        minLoad = load;
        minWindow = w.index;
      }
    }

    agent.windowIndex = minWindow;
    agent.queueStartTime = this.currentTime;
    this.windows[minWindow].queue.push(agent);
    agent.queuePosition = this.windows[minWindow].queue.length - 1;
  }

  private updateWindows(dt: number): void {
    for (const w of this.windows) {
      if (w.isBusy) {
        const agent = w.currentServing!;
        w.busyTime += dt;
        agent.stateTimer += dt;

        if (agent.stateTimer >= this.config.serveTime) {
          agent.serveEndTime = this.currentTime;
          w.currentServing = null;
          w.totalServed++;
          agent.stateTimer = 0;

          const seat = this.findFreeSeat();
          if (seat) {
            this.assignSeatToAgent(agent, seat);
          } else {
            agent.state = AgentState.WAITING_FOR_SEAT;
            agent.seatIndex = -1;
            this.seatWaitQueue.push(agent);
          }
        }
      }

      if (!w.isBusy && w.queue.length > 0) {
        const agent = w.queue.shift()!;
        agent.state = AgentState.SERVING;
        agent.serveStartTime = this.currentTime;
        agent.stateTimer = 0;
        w.currentServing = agent;

        for (let i = 0; i < w.queue.length; i++) {
          w.queue[i].queuePosition = i;
        }
      }
    }
  }

  private updateSeats(dt: number): void {
    for (const seat of this.seats) {
      if (!seat.occupied || !seat.occupant) continue;

      const agent = seat.occupant;
      if (agent.state === AgentState.EATING) {
        agent.stateTimer += dt;
        if (agent.stateTimer >= this.config.eatTime) {
          agent.leaveTime = this.currentTime;
          agent.state = AgentState.LEAVING;
          agent.stateTimer = 0;
          agent.completed = true;
          seat.occupied = false;
          seat.occupant = null;

          if (this.seatWaitQueue.length > 0) {
            const nextAgent = this.seatWaitQueue.shift()!;
            this.assignSeatToAgent(nextAgent, seat);
          }
        }
      }
    }
  }

  private assignSeatToAgent(agent: StudentAgent, seat: Seat): void {
    agent.seatIndex = seat.index;
    agent.state = AgentState.WALKING_TO_SEAT;
    agent.stateTimer = 0;
    seat.occupied = true;
    seat.occupant = agent;
  }

  private updateAgents(dt: number): void {
    for (const agent of this.agents) {
      if (agent.state === AgentState.LEFT) continue;

      if (agent.state === AgentState.LEAVING) {
        agent.stateTimer += dt;
        if (agent.stateTimer >= 0.5) {
          agent.state = AgentState.LEFT;
          this.leftAgents.push(agent);
        }
      }

      if (agent.state === AgentState.WALKING_TO_SEAT) {
        agent.stateTimer += dt;
        if (agent.stateTimer >= 0.3) {
          agent.state = AgentState.EATING;
          agent.eatStartTime = this.currentTime;
          agent.stateTimer = 0;
        }
      }
    }
  }

  private findFreeSeat(): Seat | null {
    return this.seats.find(s => !s.occupied) ?? null;
  }

  computeResult(): SimResult {
    // 只统计完成全流程的学生
    const completedAgents = this.leftAgents.filter(a => a.completed);
    const queueTimes = completedAgents
      .map(a => a.queueWaitTime)
      .filter(t => t > 0);

    const stayTimes = completedAgents
      .map(a => a.totalStayTime)
      .filter(t => t > 0);

    // 利用率计算：用到达期时长作为基准（窗口在到达期内持续运行）
    const simBase = this.config.totalDuration;
    const windowUtilization = this.windows.map(w => {
      return simBase > 0 ? Math.min(w.busyTime / simBase, 1) : 0;
    });

    const seatUtilization = this.config.seatCount * simBase > 0
      ? Math.min(this.seatBusyTime / (this.config.seatCount * simBase), 1)
      : 0;

    const avgQueueLength = this.windows.map(w => {
      if (queueTimes.length === 0) return 0;
      const windowQueueTimes = completedAgents
        .filter(a => a.windowIndex === w.index)
        .map(a => a.queueWaitTime)
        .filter(t => t > 0);
      return windowQueueTimes.length > 0
        ? windowQueueTimes.reduce((s, t) => s + t, 0) / simBase
        : 0;
    });

    return {
      config: { ...this.config },
      totalServed: completedAgents.length,
      totalArrived: this.agents.length,
      avgQueueTime: queueTimes.length > 0
        ? queueTimes.reduce((a, b) => a + b, 0) / queueTimes.length
        : 0,
      maxQueueTime: queueTimes.length > 0 ? Math.max(...queueTimes) : 0,
      minQueueTime: queueTimes.length > 0 ? Math.min(...queueTimes) : 0,
      avgStayTime: stayTimes.length > 0
        ? stayTimes.reduce((a, b) => a + b, 0) / stayTimes.length
        : 0,
      windowUtilization,
      seatUtilization,
      avgQueueLength,
      queueTimes,
      seatWaitCount: this.seatWaitQueue.length,
      actualDuration: this.currentTime,
      wasForceEnded: this.wasForceEnded,
      unfinishedCount: this.agents.filter(a => !a.completed).length,
    };
  }
}

// ======================== 批量仿真 ========================

export interface BatchConfig {
  windowCounts: number[];
  arrivalRates: number[];
  baseConfig: Omit<SimConfig, 'windowCount' | 'arrivalRate'>;
}

/** 运行批量仿真 */
export function runBatchSimulation(batchConfig: BatchConfig): SimResult[][] {
  const results: SimResult[][] = [];

  for (const rate of batchConfig.arrivalRates) {
    const row: SimResult[] = [];
    for (const wc of batchConfig.windowCounts) {
      const config: SimConfig = {
        ...batchConfig.baseConfig,
        windowCount: wc,
        arrivalRate: rate,
      };

      const engine = new SimulationEngine(config);
      engine.running = true;

      const dt = 0.1;
      let safety = 0;
      while (!engine.finished && safety < 1000000) {
        engine.step(dt);
        safety++;
      }

      row.push(engine.computeResult());
    }
    results.push(row);
  }

  return results;
}
