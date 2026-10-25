// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';

// React 19's scheduler posts its work through a MessageChannel. Node's MessagePort keeps the
// process alive, so Jest never exits after a test that loads react-dom. This channel delivers
// messages with a real (never faked) zero-delay timer instead, which lets Jest exit.
const realSetTimeout = global.setTimeout;

class TimerMessageChannel {
  constructor() {
    const makePort = () => ({ onmessage: null, close() {}, postMessage: () => {} });
    this.port1 = makePort();
    this.port2 = makePort();
    this.port1.postMessage = (data) => realSetTimeout(() => this.port2.onmessage?.({ data }), 0);
    this.port2.postMessage = (data) => realSetTimeout(() => this.port1.onmessage?.({ data }), 0);
  }
}
Object.assign(global, { MessageChannel: TimerMessageChannel });
