import type { BrowserFrame, BrowserState } from '../shared/types';
import type { ShareServerMessage, ShareState } from '../shared/share';

export class ShareConnection {
  private socket?: WebSocket;
  private pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private nextId = 0;
  private stopped = false;
  private retry?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private resume = sessionStorage.getItem('athena-share-resume') || '';
  state?: ShareState;
  browser?: BrowserState;
  participantId = '';
  frame?: BrowserFrame;
  constructor(
    private name: string,
    private invite: string,
    private receive: (message: ShareServerMessage) => void,
    private status: (value: string) => void,
  ) {}
  connect(): void {
    if (this.stopped) return;
    this.status(this.attempts ? '正在重新连接…' : '正在连接…');
    const socket = (this.socket = new WebSocket(
      `${location.origin.replace('https:', 'wss:')}/connect`,
    ));
    socket.onopen = () => {
      this.nextId = 0;
      socket.send(
        JSON.stringify({ type: 'join', name: this.name, invite: this.invite, resume: this.resume }),
      );
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      const message: ShareServerMessage = JSON.parse(event.data);
      if (message.type === 'welcome') {
        this.participantId = message.participantId;
        this.resume = message.resume;
        sessionStorage.setItem('athena-share-resume', message.resume);
        this.attempts = 0;
        this.status('已连接');
      }
      if (message.type === 'state') {
        this.state = message.state;
        if (message.browser) this.browser = message.browser;
      }
      if (message.type === 'result') {
        const pending = this.pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.value);
        }
        return;
      }
      if (message.type === 'ended' || message.type === 'error') {
        this.stopped = true;
        sessionStorage.removeItem('athena-share-resume');
        if (message.type === 'ended') this.status('共享已结束');
      }
      this.receive(message);
    };
    socket.onclose = (event) => {
      if (socket !== this.socket) return;
      this.frame = undefined;
      this.rejectPending('连接已中断，未确认的操作不会重试，请查看页面后继续');
      if (event.code === 4001 || event.code === 1008) {
        this.stopped = true;
        sessionStorage.removeItem('athena-share-resume');
        this.status(event.code === 4001 ? '已退出共享' : '连接已拒绝');
      }
      if (!this.stopped) {
        this.status('连接中断，正在重连…');
        this.retry = setTimeout(
          () => {
            this.attempts++;
            this.connect();
          },
          Math.min(10_000, 750 * 2 ** Math.min(this.attempts, 4)),
        );
      }
    };
  }
  acknowledge(frame: BrowserFrame): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.frame = frame;
    this.socket.send(JSON.stringify({ type: 'ack', sequence: frame.sequence, epoch: frame.epoch }));
  }
  invoke<T = unknown>(action: string, payload?: unknown): Promise<T> {
    const socket = this.socket;
    if (this.stopped || socket?.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error('尚未连接，请等待重连'));
    if (this.pending.size >= 64 || socket.bufferedAmount > 128_000)
      return Promise.reject(new Error('输入过快，请等待页面响应'));
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('操作结果尚未确认，请检查页面后继续'));
      }, 15_000);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      socket.send(
        JSON.stringify({
          type: 'command',
          id,
          action,
          payload,
          generation: this.state?.generation,
          frame: this.frame && { sequence: this.frame.sequence, epoch: this.frame.epoch },
        }),
      );
    });
  }
  private rejectPending(message: string): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
    }
    this.pending.clear();
  }
  close(): void {
    this.stopped = true;
    clearTimeout(this.retry);
    this.socket?.close();
    this.rejectPending('已离开共享');
    this.frame = undefined;
  }
}
