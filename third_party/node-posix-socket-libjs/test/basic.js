/* global describe */
/* global it */

import socket from "../lib/index.js";

const AF_NETLINK = 16;
const SOCK_DGRAM = 2;
const NETLINK_ROUTE = 0;

describe("basic", () => {
  it("should open socket successfully", async () => {
    const sock = await socket.create({
      "domain": AF_NETLINK,
      "type": SOCK_DGRAM,
      "protocol": NETLINK_ROUTE
    });

    await sock.close();
  });
});
