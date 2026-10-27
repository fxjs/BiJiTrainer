/**
 * 触感音效：纸牌瞬态与柔和音阶，首次使用时合成并缓存 PCM。
 * 高频操作只创建一次性播放节点，不下载素材、不启动 JS 音频循环。
 */
export type SoundName =
  | 'deal' | 'select' | 'deselect' | 'place' | 'unplace'
  | 'ready' | 'foulWarn' | 'submit'
  | 'best' | 'minor' | 'mistake' | 'foul' | 'xi' | 'tick' | 'ui'

export interface SoundOptions {
  enabled: boolean
  volume: number
  /** 震动独立于音效开关；iOS Safari 不支持 navigator.vibrate。 */
  vibrate: boolean
}

export interface PlayOptions {
  /** 连续最优按半音升调，最多一个八度。 */
  streak?: number
  /** 以音频时钟调度，不用可能跨手触发的 setTimeout。 */
  delay?: number
  /** 试听等场景可单独关闭震动。 */
  haptic?: boolean
}

const DURATION: Record<SoundName, number> = {
  deal: .43, select: .045, deselect: .05, place: .085, unplace: .08,
  ready: .23, foulWarn: .28, submit: .1, best: .42, minor: .29,
  mistake: .4, foul: .28, xi: .68, tick: .04, ui: .05,
}
const VIBRATION: Partial<Record<SoundName, number | number[]>> = {
  place: 8, ready: 12, foulWarn: [18, 35, 18], best: 18,
  mistake: [10, 30, 10], foul: [22, 35, 22], xi: [12, 25, 12, 25, 28],
}
const NOTES = [523.25, 659.25, 783.99, 1046.5, 1318.5] as const

/** 带短起音与指数衰减的柔和泛音，变频时积分相位以避免断点。 */
function mixTone(data: Float32Array, rate: number, at: number, duration: number, frequency: number, gain: number, end = frequency): void {
  const start = Math.round(at * rate)
  const length = Math.min(Math.round(duration * rate), data.length - start)
  for (let i = 0; i < length; i++) {
    const time = i / rate
    const envelope = Math.min(1, time / .003) * Math.exp(-6 * time / duration)
    const phase = 2 * Math.PI * (frequency * time + (end - frequency) * time * time / (2 * duration))
    data[start + i] += gain * envelope * (Math.sin(phase) + .14 * Math.sin(2 * phase))
  }
}

/** 双低通差分形成柔和纸面频段；固定种子使缓存音色可重复，不依赖素材授权。 */
function mixPaper(data: Float32Array, rate: number, at: number, duration: number, gain: number, seed: number): void {
  const start = Math.round(at * rate)
  const length = Math.min(Math.round(duration * rate), data.length - start)
  let fast = 0
  let slow = 0
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = seed / 2147483648 - 1
    fast += .5 * (noise - fast)
    slow += .08 * (noise - slow)
    const time = i / rate
    const envelope = Math.min(1, time / .001) * Math.exp(-6 * time / duration)
    data[start + i] += (fast - slow) * gain * envelope
  }
}

export class SoundBoard {
  private readonly opts: SoundOptions
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private readonly samples = new Map<SoundName, AudioBuffer>()
  private readonly voices = new Map<AudioBufferSourceNode, GainNode>()
  private lastTap = -Infinity
  private disposed = false
  private readonly onVisibility = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      this.stop()
      void this.ctx?.suspend().catch(() => { /* 页面销毁时音频设备可能已关闭。 */ })
    }
    // 回到前台只在下一个用户手势恢复，不补播后台或上一手的声音。
  }

  constructor(opts: SoundOptions) {
    this.opts = { ...opts, volume: Math.max(0, Math.min(1, opts.volume)) }
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', this.onVisibility)
  }

  setOptions(patch: Partial<SoundOptions>): void {
    Object.assign(this.opts, patch)
    this.opts.volume = Number.isFinite(this.opts.volume) ? Math.max(0, Math.min(1, this.opts.volume)) : 0
    if (!this.opts.enabled || this.opts.volume === 0) {
      this.stop()
      void this.ctx?.suspend().catch(() => { /* 关闭中的音频设备无需再次挂起。 */ })
    }
    if (this.master && this.ctx) {
      const time = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(time)
      this.master.gain.setTargetAtTime(this.opts.enabled ? this.opts.volume : 0, time, .012)
    }
    if (!this.opts.vibrate && typeof navigator !== 'undefined')
      navigator.vibrate?.(0)
  }

  /** 必须在 pointerdown / keydown 等用户手势中调用，兼容 iOS 音频解锁。 */
  unlock(): void {
    if (!this.opts.enabled || this.opts.volume === 0 || this.disposed || (typeof document !== 'undefined' && document.hidden))
      return
    const ctx = this.ensureContext()
    if (ctx?.state === 'suspended')
      void ctx.resume().catch(() => { /* 浏览器仍限制播放时，下一次手势会再次尝试。 */ })
  }

  play(name: SoundName, options?: PlayOptions): void {
    if (this.disposed || (typeof document !== 'undefined' && document.hidden))
      return
    // 同一滑选手势中的极密集反馈合并，避免高频叠音和不必要的播放节点。
    const now = performance.now()
    if (name === 'select' || name === 'deselect' || name === 'ui') {
      if (now - this.lastTap < 25)
        return
      this.lastTap = now
    }
    if (name === 'deal' || name === 'best' || name === 'minor' || name === 'mistake' || name === 'foul')
      this.stop()
    if (this.opts.vibrate && options?.haptic !== false && !options?.delay && typeof navigator !== 'undefined') {
      const pattern = VIBRATION[name]
      if (pattern !== undefined)
        navigator.vibrate?.(pattern)
    }
    if (!this.opts.enabled || this.opts.volume === 0)
      return
    const ctx = this.ensureContext()
    if (!ctx || ctx.state !== 'running')
      return
    if (this.voices.size >= 12) {
      const oldest = this.voices.keys().next().value
      if (oldest)
        this.release(oldest)
    }
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = this.sample(name, ctx)
    source.playbackRate.value = name === 'best' ? 2 ** (Math.min(Math.max(options?.streak ?? 0, 0), 12) / 12) : 1
    // 极轻微的音色变化，连选不会像机械蜂鸣器；评级音阶保持准确。
    if (name === 'select' || name === 'place' || name === 'unplace')
      source.detune.value = (Math.random() - .5) * 35
    source.connect(gain).connect(this.master!)
    this.voices.set(source, gain)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      this.voices.delete(source)
    }
    source.start(ctx.currentTime + .002 + Math.max(0, options?.delay ?? 0))
  }

  /** 下一手、退出、静音、后台均取消正在播放及尚未开始的声音。 */
  stop(): void {
    for (const source of this.voices.keys())
      this.release(source)
    if (this.opts.vibrate && typeof navigator !== 'undefined')
      navigator.vibrate?.(0)
  }

  dispose(): void {
    this.stop()
    this.disposed = true
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.onVisibility)
    void this.ctx?.close().catch(() => { /* 已关闭的上下文无需再次关闭。 */ })
    this.master?.disconnect()
    this.compressor?.disconnect()
    this.ctx = null
    this.master = null
    this.compressor = null
    this.samples.clear()
  }

  private release(source: AudioBufferSourceNode): void {
    source.stop()
    source.disconnect()
    this.voices.get(source)?.disconnect()
    this.voices.delete(source)
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx)
      return this.ctx
    const constructors = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }
    const Ctor = constructors.AudioContext ?? constructors.webkitAudioContext
    if (!Ctor)
      return null
    const ctx = new Ctor({ latencyHint: 'interactive' })
    const master = ctx.createGain()
    const compressor = ctx.createDynamicsCompressor()
    master.gain.value = this.opts.volume
    compressor.threshold.value = -9
    compressor.knee.value = 12
    compressor.ratio.value = 3
    compressor.attack.value = .003
    compressor.release.value = .12
    master.connect(compressor).connect(ctx.destination)
    this.ctx = ctx
    this.master = master
    this.compressor = compressor
    return ctx
  }

  private sample(name: SoundName, ctx: AudioContext): AudioBuffer {
    const existing = this.samples.get(name)
    if (existing)
      return existing
    const rate = ctx.sampleRate
    const buffer = ctx.createBuffer(1, Math.ceil(DURATION[name] * rate), rate)
    const data = buffer.getChannelData(0)
    switch (name) {
      case 'deal':
        for (let i = 0; i < 3; i++)
          mixPaper(data, rate, i * .025, .055, .3, 42 + i)
        for (let i = 0; i < 9; i++)
          mixPaper(data, rate, .09 + i * .035, .025, .55, 100 + i)
        break
      case 'select':
        mixPaper(data, rate, 0, .035, .32, 11)
        mixTone(data, rate, 0, .025, 950, .045, 1100)
        break
      case 'deselect':
        mixPaper(data, rate, 0, .025, .24, 12)
        mixTone(data, rate, 0, .04, 700, .04, 450)
        break
      case 'place':
        mixPaper(data, rate, 0, .05, .7, 21)
        mixTone(data, rate, 0, .075, 185, .25, 95)
        break
      case 'unplace':
        mixPaper(data, rate, 0, .055, .36, 22)
        mixTone(data, rate, 0, .065, 540, .065, 350)
        break
      case 'ready':
        mixTone(data, rate, 0, .13, NOTES[1], .17)
        mixTone(data, rate, .065, .15, 880, .17)
        break
      case 'foulWarn':
        mixTone(data, rate, 0, .11, 220, .17)
        mixTone(data, rate, .13, .11, 196, .15)
        break
      case 'submit':
        mixTone(data, rate, 0, .08, 329.63, .1, NOTES[1])
        mixPaper(data, rate, 0, .02, .18, 31)
        break
      case 'best':
        for (let i = 0; i < 4; i++)
          mixTone(data, rate, i * .055, .24, NOTES[i], .23)
        break
      case 'minor':
        mixTone(data, rate, 0, .16, NOTES[0], .15)
        mixTone(data, rate, .09, .18, NOTES[1], .15)
        break
      case 'mistake':
        mixTone(data, rate, 0, .18, 392, .15)
        mixTone(data, rate, .14, .24, 329.63, .14)
        break
      case 'foul':
        mixTone(data, rate, 0, .25, 185, .19, 135)
        mixPaper(data, rate, 0, .08, .2, 51)
        break
      case 'xi':
        for (let i = 0; i < NOTES.length; i++)
          mixTone(data, rate, i * .045, .18, NOTES[i], .17)
        for (let i = 0; i < 3; i++)
          mixTone(data, rate, .3, .34, NOTES[i], .08)
        break
      case 'tick':
        mixPaper(data, rate, 0, .025, .4, 61)
        break
      case 'ui':
        mixTone(data, rate, 0, .04, 440, .055)
        mixPaper(data, rate, 0, .015, .12, 71)
        break
    }
    // 抑制瞬态峰值并收束尾部，静音边界不会产生数字爆音。
    let peak = 0
    for (const value of data)
      peak = Math.max(peak, Math.abs(value))
    const scale = peak > .75 ? .75 / peak : 1
    const fade = Math.min(96, data.length)
    for (let i = 0; i < data.length; i++)
      data[i] *= scale * Math.min(1, (data.length - 1 - i) / fade)
    this.samples.set(name, buffer)
    return buffer
  }
}
