// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';
import { MessageChannel as NodeMessageChannel } from 'worker_threads';

// React's scheduler keeps a MessageChannel open for the whole file, which stops a
// single-file (in-band) run from exiting. Close every channel once the file is done.
const channels = [];
global.MessageChannel = class extends NodeMessageChannel {
  constructor() {
    super();
    channels.push(this);
  }
};
afterAll(() => {
  channels.forEach((c) => {
    c.port1.close();
    c.port2.close();
  });
});
