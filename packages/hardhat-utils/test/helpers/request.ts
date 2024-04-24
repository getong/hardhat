import { after, before } from "node:test";
import { MockAgent } from "undici";
import { DispatcherOptions } from "../../src/request.js";

export function getTestDispatcherOptions(options: DispatcherOptions = {}) {
  return {
    ...options,
    isTestDispatcher: true,
  };
}

const mockAgent = new MockAgent({
  keepAliveTimeout: 10,
  keepAliveMaxTimeout: 10,
});

export const mockPool = mockAgent.get("http://localhost:3000");

export const setupRequestMocking = () => {
  before(() => {
    mockAgent.disableNetConnect();
  });

  after(() => {
    mockAgent.enableNetConnect();
  });
};
