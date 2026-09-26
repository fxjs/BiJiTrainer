/**
 * 比鸡音效。全部用 Web Audio 实时合成，不依赖音频文件：
 * - 牌面类声音（发牌、落牌）用带通滤波的白噪声短脉冲模拟
 * - 提示类声音用振荡器合成音阶
 * 训练与后续的对战游戏共用。
 */

export type SoundName =
  | 'deal' // 发牌：洗牌声 + 9 次短促的发牌声
  | 'select' // 选中手牌
  | 'place' // 放入某一道
  | 'unplace' // 从某一道撤回
  | 'ready' // 三道摆满且合法
  | 'foulWarn' // 三道摆满但倒水
  | 'best' // 评级：最优（可带连击数升调）
  | 'minor' // 评级：次优
  | 'mistake' // 评级：明显失误
  | 'foul' // 评级：倒水
  | 'xi' // 成喜 / 通关
  | 'tick' // 限时模式倒计时

export interface SoundOptions {
  enabled: boolean
  /** 总音量 0..1 */
  volume: number
  /** 是否震动；navigator.vibrate 仅 Android 浏览器支持，iOS Safari 无此 API */
  vibrate: boolean
}

export interface PlayOptions {
  /** 连续最优次数，best 音效按半音逐级升高，最多升 12 个半音 */
  streak?: number
}

/** 各音效的震动模式（毫秒）；未列出的不震动 */
const VIBRATION: Partial<Record<SoundName, number | number[]>> = {
  place: 8,
  foulWarn: [30, 40, 30],
  best: 20,
  mistake: [15, 30, 15],
  foul: [40, 40, 40],
  xi: [20, 30, 20, 30, 60],
}

// 音名频率（Hz），用于提示音
const NOTE = {
  G3: 196.0,
  A3: 220.0,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
  C6: 1046.5,
  E6: 1318.5,
  G4: 392.0,
  E4: 329.63,
} as const

type AudioContextCtor = typeof AudioContext

export class SoundBoard {
  private opts: SoundOptions
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private readonly onVisibility = () => this.handleVisibility()

  constructor(opts: SoundOptions) {
    this.opts = { ...opts }
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', this.onVisibility)
  }

  setOptions(patch: Partial<SoundOptions>): void {
    this.opts = { ...this.opts, ...patch }
    if (this.master && this.ctx)
      this.master.gain.setValueAtTime(this.opts.volume, this.ctx.currentTime)
  }

  /**
   * 在用户手势（pointerdown / touchend）中调用：iOS Safari 要求 AudioContext
   * 在用户手势内创建或恢复，否则一直静音。
   */
  unlock(): void {
    const ctx = this.ensureContext()
    if (ctx && ctx.state === 'suspended')
      void ctx.resume()
  }

  play(name: SoundName, po: PlayOptions = {}): void {
    if (this.opts.vibrate)
      this.vibrate(name)
    if (!this.opts.enabled || this.opts.volume <= 0)
      return
    const ctx = this.ensureContext()
    if (!ctx || ctx.state !== 'running')
      return
    const t = ctx.currentTime + 0.005
    switch (name) {
      case 'deal':
        // 洗牌：三段较长的噪声；随后 9 张发牌，每张 55 ms
        for (let i = 0; i < 3; i++)
          this.burst(t + i * 0.09, { freq: 2600, q: 0.8, dur: 0.08, gain: 0.35 })
        for (let i = 0; i < 9; i++)
          this.burst(t + 0.32 + i * 0.055, { freq: 3200, q: 1.2, dur: 0.03, gain: 0.45 })
        break
      case 'select':
        this.tone(t, { freq: NOTE.A5, dur: 0.04, gain: 0.12, type: 'sine' })
        break
      case 'place':
        this.burst(t, { freq: 1800, q: 1, dur: 0.05, gain: 0.5 })
        this.tone(t, { freq: 170, dur: 0.05, gain: 0.25, type: 'sine' })
        break
      case 'unplace':
        this.tone(t, { freq: 620, to: 400, dur: 0.07, gain: 0.12, type: 'triangle' })
        break
      case 'ready':
        this.tone(t, { freq: NOTE.E5, dur: 0.08, gain: 0.18, type: 'triangle' })
        this.tone(t + 0.08, { freq: NOTE.A5, dur: 0.1, gain: 0.18, type: 'triangle' })
        break
      case 'foulWarn':
        this.tone(t, { freq: NOTE.A3, dur: 0.09, gain: 0.16, type: 'square' })
        this.tone(t + 0.14, { freq: NOTE.A3, dur: 0.09, gain: 0.16, type: 'square' })
        break
      case 'best': {
        // 大三和弦琶音，连击时整体升调
        const k = 2 ** (Math.min(po.streak ?? 0, 12) / 12)
        ;[NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) =>
          this.tone(t + i * 0.07, { freq: f * k, dur: 0.12, gain: 0.2, type: 'triangle' }))
        break
      }
      case 'minor':
        this.tone(t, { freq: NOTE.C5, dur: 0.1, gain: 0.18, type: 'triangle' })
        this.tone(t + 0.09, { freq: NOTE.E5, dur: 0.14, gain: 0.18, type: 'triangle' })
        break
      case 'mistake':
        // 下行小三度，音量较低，避免刺耳
        this.tone(t, { freq: NOTE.G4, dur: 0.14, gain: 0.16, type: 'triangle' })
        this.tone(t + 0.13, { freq: NOTE.E4, dur: 0.22, gain: 0.16, type: 'triangle' })
        break
      case 'foul':
        this.tone(t, { freq: NOTE.A3, to: NOTE.G3, dur: 0.3, gain: 0.2, type: 'triangle' })
        this.burst(t, { freq: 400, q: 0.7, dur: 0.15, gain: 0.25 })
        break
      case 'xi':
        ;[NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) =>
          this.tone(t + i * 0.06, { freq: f, dur: 0.12, gain: 0.16, type: 'triangle' }))
        for (const f of [NOTE.C5, NOTE.E5, NOTE.G5])
          this.tone(t + 0.34, { freq: f, dur: 0.6, gain: 0.1, type: 'sine' })
        break
      case 'tick':
        this.burst(t, { freq: 4200, q: 3, dur: 0.02, gain: 0.3 })
        break
    }
  }

  dispose(): void {
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.onVisibility)
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx)
      return this.ctx
    const w = globalThis as unknown as { AudioContext?: AudioContextCtor, webkitAudioContext?: AudioContextCtor }
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    if (!Ctor)
      return null
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.value = this.opts.volume
    master.connect(ctx.destination)
    // 0.5 秒白噪声，所有噪声脉冲复用
    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++)
      data[i] = Math.random() * 2 - 1
    this.ctx = ctx
    this.master = master
    this.noise = noise
    return ctx
  }

  /** 带通滤波的噪声短脉冲：2 ms 起音，指数衰减 */
  private burst(t: number, p: { freq: number, q: number, dur: number, gain: number }): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = p.freq
    filter.Q.value = p.q
    const g = this.envelope(t, p.dur, p.gain)
    src.connect(filter).connect(g).connect(this.master!)
    // 从噪声缓冲的随机位置开始，避免每次听起来完全一样
    src.start(t, Math.random() * 0.4, p.dur + 0.02)
  }

  private tone(t: number, p: { freq: number, to?: number, dur: number, gain: number, type: OscillatorType }): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = p.type
    osc.frequency.setValueAtTime(p.freq, t)
    if (p.to)
      osc.frequency.exponentialRampToValueAtTime(p.to, t + p.dur)
    const g = this.envelope(t, p.dur, p.gain)
    osc.connect(g).connect(this.master!)
    osc.start(t)
    osc.stop(t + p.dur + 0.02)
  }

  private envelope(t: number, dur: number, peak: number): GainNode {
    const g = this.ctx!.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    return g
  }

  private vibrate(name: SoundName): void {
    const pattern = VIBRATION[name]
    const nav = globalThis.navigator as Navigator | undefined
    if (pattern !== undefined && typeof nav?.vibrate === 'function')
      nav.vibrate(pattern)
  }

  /** 页面切到后台时挂起，回到前台时恢复，避免后台占用音频设备 */
  private handleVisibility(): void {
    if (!this.ctx)
      return
    if (document.hidden)
      void this.ctx.suspend()
    else
      void this.ctx.resume()
  }
}
